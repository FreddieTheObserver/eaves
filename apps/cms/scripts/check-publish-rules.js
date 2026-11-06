// Boots Strapi on a throwaway database and checks the publish rules (src/publish-rules): a document whose
// cover, portrait or Section image has no alt text cannot be published, and a document that published pages
// still depend on cannot be unpublished or deleted. It tests the Document Service and
// then the admin's own HTTP routes as a signed-in Super Admin, because a middleware registers and type-checks
// fine even when the admin's Publish button never reaches it.
// It creates its own database on the server named by the usual DATABASE_* variables and drops it afterwards,
// so it never touches the development database.
const path = require('path');
const { Client } = require('pg');
const { createStrapi, compileStrapi } = require('@strapi/strapi');
const { removeFiles, uploadImage } = require('./lib/media');

const appDir = path.resolve(__dirname, '..');
const scratchName = `eaves_publish_${process.pid}_${Date.now()}`;

const server = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT || 5432),
  user: process.env.DATABASE_USERNAME || 'strapi',
  password: process.env.DATABASE_PASSWORD || 'strapi',
};
const withMaintenanceDb = async (statement) => {
  const client = new Client({ ...server, database: 'postgres' });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
};

let passed = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? ` (${detail})` : ''}`);
};

const MEDIA_TYPES = [
  { name: 'project', field: 'cover', label: 'cover image' },
  { name: 'service', field: 'cover', label: 'cover image' },
  { name: 'article', field: 'cover', label: 'cover image' },
  { name: 'team-member', field: 'portrait', label: 'portrait' },
];

const run = async () => {
  // Compiling can exit the process on a type error, so it comes before the database exists to leak.
  process.chdir(appDir);
  const appContext = await compileStrapi();

  await withMaintenanceDb(`CREATE DATABASE "${scratchName}"`);

  Object.assign(process.env, {
    DATABASE_CLIENT: 'postgres',
    DATABASE_NAME: scratchName,
    DATABASE_URL: '',
    HOST: '127.0.0.1',
    PORT: '0',
    STRAPI_TELEMETRY_DISABLED: 'true',
  });

  const strapi = await createStrapi(appContext).start();
  strapi.log.level = 'error';
  const uploaded = [];

  try {
    const base = `http://127.0.0.1:${strapi.server.httpServer.address().port}`;
    const documents = (name) => strapi.documents(`api::${name}.${name}`);
    const uidOf = (name) => `api::${name}.${name}`;
    const upload = async (key) => {
      const file = await uploadImage(strapi, key, { width: 64, height: 48 });
      uploaded.push(file);
      return file.id;
    };
    const setAlt = (fileId, alternativeText) => strapi.plugin('upload').service('upload').updateFileInfo(fileId, { alternativeText });

    const described = await upload('described');
    await setAlt(described, 'A pale timber stair in a double-height hall');
    const image = await upload('image');

    let counter = 0;
    const dataFor = (name, mediaId) => {
      const n = ++counter;
      switch (name) {
        case 'project':
          return { title: `Project ${n}`, slug: `project-${n}`, summary: 'A summary.', cover: mediaId, neighbourhood: 'Ari', city: 'Bangkok', year: 2024, floorArea: 100, stage: 'completed' };
        case 'service':
          return { name: `Service ${n}`, slug: `service-${n}`, summary: 'A summary.', cover: mediaId, spaces: [{ text: 'Houses' }], scope: [{ text: 'Space planning' }], order: n };
        case 'article':
          return { title: `Article ${n}`, slug: `article-${n}`, excerpt: 'An excerpt.', cover: mediaId, publicationDate: '2026-01-01' };
        case 'team-member':
          return { name: `Person ${n}`, position: 'Designer', bio: 'A bio.', portrait: mediaId, order: n };
        default:
          throw new Error(`no data for ${name}`);
      }
    };

    const isPublished = async (name, documentId) => Boolean(await documents(name).findOne({ documentId, locale: 'en', status: 'published' }));
    const isDraft = async (name, documentId) => Boolean(await documents(name).findOne({ documentId, locale: 'en', status: 'draft' }));
    const refusal = async (promise) => {
      try {
        await promise;
        return null;
      } catch (error) {
        return error;
      }
    };
    const refused = async (label, promise, fragment) => {
      const error = await refusal(promise);
      check(label, Boolean(error) && error.name === 'ValidationError' && error.message.includes(fragment), error ? error.message : 'it went through');
    };

    for (const { name, field, label } of MEDIA_TYPES) {
      const doc = await documents(name).create({ locale: 'en', data: dataFor(name, image) });
      const publish = () => documents(name).publish({ documentId: doc.documentId, locale: 'en' });

      check(`${name}: a draft with no alt text saves`, await isDraft(name, doc.documentId));
      await refused(`${name}: the ${label} with no alt text is refused`, publish(), `The ${label} has no alternative text`);
      check(`${name}: the refused document stays a draft`, !(await isPublished(name, doc.documentId)) && (await isDraft(name, doc.documentId)));

      await setAlt(image, '   ');
      await refused(`${name}: alt text of only spaces is refused`, publish(), `The ${label} has no alternative text`);

      await setAlt(image, 'A sunlit living room with oak shelving');
      await publish();
      check(`${name}: the same document publishes once the alt text is set`, await isPublished(name, doc.documentId));
      await setAlt(image, '');
    }

    // A share image is never shown on the page, so it needs no alt text.
    const shared = await documents('project').create({ locale: 'en', data: { ...dataFor('project', described), seo: { metaTitle: 'Shared', shareImage: image } } });
    await documents('project').publish({ documentId: shared.documentId, locale: 'en' });
    check('project: a share image with no alt text does not stop a publish', await isPublished('project', shared.documentId));

    // The Document Service publishes a create or update with status "published" through a path that skips middleware.
    await refused('project: create with status published is refused', documents('project').create({ locale: 'en', status: 'published', data: dataFor('project', described) }), 'as a draft, then publish');
    await refused('project: update with status published is refused', documents('project').update({ documentId: shared.documentId, locale: 'en', status: 'published', data: { title: 'Renamed' } }), 'as a draft, then publish');
    check('project: neither of those left a published copy behind', (await documents('project').findMany({ locale: 'en', status: 'published', filters: { title: 'Renamed' } })).length === 0);
    const pagePublished = await documents('page').create({ locale: 'en', status: 'published', data: { title: 'Privacy', slug: 'privacy' } });
    check('page: types without a rule still create with status published', await isPublished('page', pagePublished.documentId));

    for (const name of ['home-page', 'studio-page']) {
      const section = (component, extra) => ({ __component: component, ...extra });
      const statement = (extra) => section('sections.statement', { text: 'A statement.', ...extra });
      const introduction = (extra) => section('sections.studio-introduction', { heading: 'The studio', text: 'A studio.', linkLabel: 'About', ...extra });
      const home = await documents(name).create({ locale: 'en', data: { sections: [statement({ image })] } });
      const edit = (sections) => documents(name).update({ documentId: home.documentId, locale: 'en', data: { sections } });
      const publish = () => documents(name).publish({ documentId: home.documentId, locale: 'en' });

      await refused(`${name}: a Statement image with no alt text is refused`, publish(), 'Section 1 (Statement) has an image but no alt text');
      await edit([statement({ image, imageAlt: '   ' })]);
      await refused(`${name}: a Statement alt text of only spaces is refused`, publish(), 'Section 1 (Statement)');
      await edit([statement({ image }), section('sections.contact-prompt', { heading: 'Talk', linkLabel: 'Contact' }), introduction({ image })]);
      const both = await refusal(publish());
      check(`${name}: every Section that breaks the rule is reported`, Boolean(both) && both.message.includes('Section 1 (Statement)') && both.message.includes('Section 3 (Studio introduction)'), both ? both.message : 'it went through');
      check(`${name}: the refused page is not published`, !(await isPublished(name, home.documentId)));

      await edit([statement(), introduction({ image, imageAlt: 'The studio library' })]);
      await publish();
      check(`${name}: Sections with no image, or with alt text, publish`, await isPublished(name, home.documentId));
    }

    // The admin's Publish button, bulk publish, and publishing a brand-new entry all go through here.
    const superAdmin = await strapi.service('admin::role').getSuperAdmin();
    await strapi.service('admin::user').create({ email: 'admin@example.com', firstname: 'Admin', lastname: 'User', password: 'Passw0rd!admin', isActive: true, roles: [superAdmin.id] });
    const login = await fetch(`${base}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'Passw0rd!admin' }) });
    const { data: session } = await login.json();
    check('the check can sign in to the admin', login.status === 200 && Boolean(session && session.token), `got ${login.status}`);

    const admin = async (route, body, method = 'POST') => {
      const response = await fetch(`${base}/content-manager${route}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let json = {};
      try {
        json = JSON.parse(text);
      } catch (error) {
        json = { raw: text };
      }
      return { status: response.status, message: (json.error && json.error.message) || json.raw || '' };
    };
    const refusedByAdmin = (label, result, fragment) => check(label, result.status === 400 && result.message.includes(fragment), `got ${result.status} ${result.message}`);

    const projectDoc = await documents('project').create({ locale: 'en', data: dataFor('project', image) });
    const otherDoc = await documents('project').create({ locale: 'en', data: dataFor('project', image) });
    const model = encodeURIComponent(uidOf('project'));

    refusedByAdmin('admin: Publish on a project with no alt text is refused', await admin(`/collection-types/${model}/${projectDoc.documentId}/actions/publish?locale=en`, {}), 'no alternative text');
    refusedByAdmin('admin: bulk publish with no alt text is refused', await admin(`/collection-types/${model}/actions/bulkPublish?locale=en`, { documentIds: [projectDoc.documentId, otherDoc.documentId] }), 'no alternative text');
    check('admin: neither refused publish left a published project', !(await isPublished('project', projectDoc.documentId)) && !(await isPublished('project', otherDoc.documentId)));

    const before = await documents('project').count({ locale: 'en', status: 'draft' });
    refusedByAdmin('admin: Publish on a new, unsaved project with no alt text is refused', await admin(`/collection-types/${model}/actions/publish?locale=en`, dataFor('project', image)), 'no alternative text');
    check('admin: the refused new project was not saved', (await documents('project').count({ locale: 'en', status: 'draft' })) === before);

    const home = await documents('home-page').findFirst({ locale: 'en', status: 'draft' });
    await documents('home-page').update({ documentId: home.documentId, locale: 'en', data: { sections: [{ __component: 'sections.statement', text: 'A statement.', image }] } });
    refusedByAdmin('admin: Publish on the Home page with no alt text is refused', await admin(`/single-types/${encodeURIComponent(uidOf('home-page'))}/actions/publish?locale=en`, {}), 'Section 1 (Statement)');

    await setAlt(image, 'A sunlit living room with oak shelving');
    const accepted = await admin(`/collection-types/${model}/${projectDoc.documentId}/actions/publish?locale=en`, {});
    check('admin: Publish works once the alt text is set', accepted.status === 200 && (await isPublished('project', projectDoc.documentId)), `got ${accepted.status} ${accepted.message}`);
    const bulk = await admin(`/collection-types/${model}/actions/bulkPublish?locale=en`, { documentIds: [otherDoc.documentId] });
    check('admin: bulk publish works once the alt text is set', bulk.status === 200 && (await isPublished('project', otherDoc.documentId)), `got ${bulk.status} ${bulk.message}`);

    // Unpublishing or deleting a document that published pages still depend on is refused. The rule is the same
    // as the web app's: a Credit needs its Team Member, a Byline and a Project need at least one person or Service,
    // Selected Projects needs three, and a Project or Article needs its Typology or Topic.
    const publishNew = async (name, data) => {
      const doc = await documents(name).create({ locale: 'en', data });
      await documents(name).publish({ documentId: doc.documentId, locale: 'en' });
      return { id: doc.documentId, data };
    };
    const person = async () => (await publishNew('team-member', dataFor('team-member', described))).id;
    const unpublish = (name, id) => documents(name).unpublish({ documentId: id, locale: 'en' });
    const remove = (name, id) => documents(name).delete({ documentId: id, locale: 'en' });
    const allowed = async (label, promise) => {
      const error = await refusal(promise);
      check(label, !error, error ? error.message : '');
    };
    const projectWith = (extra) => publishNew('project', { ...dataFor('project', described), ...extra });
    const articleWith = (extra) => publishNew('article', { ...dataFor('article', described), ...extra });
    const typology = (slug) => documents('typology').create({ locale: 'en', data: { name: slug, slug } });
    const topic = (slug) => documents('topic').create({ locale: 'en', data: { name: slug, slug } });

    const credited = await person();
    const crediting = await projectWith({ credits: [{ role: 'Lead designer', teamMember: credited }] });
    await refused('team member: unpublishing a credited person is refused', unpublish('team-member', credited), `Project "${crediting.data.title}" credits this Team Member.`);
    await refused('team member: deleting a credited person is refused', remove('team-member', credited), 'Cannot delete');
    check('team member: the refused person is still published', await isPublished('team-member', credited));
    await documents('project').update({ documentId: crediting.id, locale: 'en', data: { credits: [] } });
    await documents('project').publish({ documentId: crediting.id, locale: 'en' });
    await allowed('team member: unpublishing works once the Credit is gone', unpublish('team-member', credited));
    check('team member: and then they are unpublished', !(await isPublished('team-member', credited)));

    const sole = await person();
    const coauthor = await person();
    const other = await person();
    const soleArticle = await articleWith({ byline: [sole] });
    const sharedArticle = await articleWith({ byline: [coauthor, other] });
    await refused('byline: unpublishing the only person is refused', unpublish('team-member', sole), `Article "${soleArticle.data.title}" would have no one in its Byline.`);
    await allowed('byline: unpublishing a person while others remain is allowed', unpublish('team-member', coauthor));
    const left = await documents('article').findOne({ documentId: sharedArticle.id, locale: 'en', status: 'published', populate: ['byline'] });
    check('byline: that Article stays published with the person who remains', left.byline.length === 1 && left.byline[0].documentId === other, `byline has ${left.byline.length}`);

    const onlyService = (await publishNew('service', dataFor('service', described))).id;
    const extraService = (await publishNew('service', dataFor('service', described))).id;
    const keptService = (await publishNew('service', dataFor('service', described))).id;
    const singleService = await projectWith({ services: [onlyService] });
    await projectWith({ services: [extraService, keptService] });
    await refused('service: unpublishing the last Service of a Project is refused', unpublish('service', onlyService), `Project "${singleService.data.title}" would have no Service.`);
    await allowed('service: unpublishing one of two Services is allowed', unpublish('service', extraService));

    const featured = [];
    for (let i = 0; i < 5; i++) featured.push((await projectWith({})).id);
    const selected = (ids) => [{ __component: 'sections.selected-projects', heading: 'Selected projects', projects: ids }];
    const publishPage = async (name, ids) => {
      const page = await documents(name).findFirst({ locale: 'en', status: 'draft' });
      await documents(name).update({ documentId: page.documentId, locale: 'en', data: { sections: selected(ids) } });
      await documents(name).publish({ documentId: page.documentId, locale: 'en' });
    };
    await publishPage('home-page', featured.slice(0, 4));
    await publishPage('studio-page', featured.slice(2, 5));
    await allowed('selected projects: going from four Projects to three is allowed', unpublish('project', featured[0]));
    await refused('selected projects: going from three to two is refused', unpublish('project', featured[1]), 'Selected Projects on the Home page would have 2 Projects');
    await refused('selected projects: the Studio page is checked too', unpublish('project', featured[4]), 'Selected Projects on the Studio page would have 2 Projects');
    await refused('selected projects: deleting is checked like unpublishing', remove('project', featured[1]), 'Cannot delete');

    const usedTypology = await typology('used-typology');
    const unusedTypology = await typology('unused-typology');
    const usedTopic = await topic('used-topic');
    const unusedTopic = await topic('unused-topic');
    const typed = await projectWith({ typology: usedTypology.documentId });
    const topical = await articleWith({ topic: usedTopic.documentId });
    await refused('typology: deleting one a published Project uses is refused', remove('typology', usedTypology.documentId), `Project "${typed.data.title}" would have no Typology.`);
    await allowed('typology: deleting an unused one is allowed', remove('typology', unusedTypology.documentId));
    await refused('topic: deleting one a published Article uses is refused', remove('topic', usedTopic.documentId), `Article "${topical.data.title}" would have no Topic.`);
    await allowed('topic: deleting an unused one is allowed', remove('topic', unusedTopic.documentId));

    // A relation the web app does not require, and a holder that is not published, never block anything.
    const speaker = await person();
    await projectWith({ body: [{ __component: 'blocks.quote', text: 'Rooms should breathe.', speaker }] });
    await allowed('a Quote speaker does not block unpublishing a person', unpublish('team-member', speaker));
    const related = (await projectWith({})).id;
    await articleWith({ relatedProjects: [related] });
    await allowed('a related Project does not block unpublishing a Project', unpublish('project', related));
    const draftHeld = await person();
    await documents('project').create({ locale: 'en', data: { ...dataFor('project', described), credits: [{ role: 'Lead designer', teamMember: draftHeld }] } });
    await allowed('a Project that is only a draft does not block unpublishing a person', unpublish('team-member', draftHeld));
    const laterHeld = await person();
    const laterProject = await projectWith({});
    await documents('project').update({ documentId: laterProject.id, locale: 'en', data: { credits: [{ role: 'Lead designer', teamMember: laterHeld }] } });
    await allowed('an unpublished edit that adds a Credit does not block unpublishing a person', unpublish('team-member', laterHeld));

    // A holder past the first page of results must still be found, and a long list is cut short.
    const paged = await person();
    const pagedOther = await person();
    for (let i = 0; i < 30; i++) await articleWith({ byline: [paged, pagedOther] });
    const lastHolder = await articleWith({ byline: [paged] });
    await refused('paging: the only holder after thirty others is found', unpublish('team-member', paged), `Article "${lastHolder.data.title}" would have no one in its Byline.`);
    const many = await person();
    for (let i = 0; i < 7; i++) await projectWith({ credits: [{ role: 'Designer', teamMember: many }] });
    await refused('a long list of dependents is cut short', unpublish('team-member', many), 'And 2 more.');

    // The admin's own routes for unpublish, bulk unpublish and delete.
    const adminPerson = await person();
    const adminProject = await projectWith({ credits: [{ role: 'Lead designer', teamMember: adminPerson }] });
    const personModel = encodeURIComponent(uidOf('team-member'));
    refusedByAdmin('admin: Unpublish on a credited person is refused', await admin(`/collection-types/${personModel}/${adminPerson}/actions/unpublish?locale=en`, {}), 'credits this Team Member');
    refusedByAdmin('admin: bulk unpublish on a credited person is refused', await admin(`/collection-types/${personModel}/actions/bulkUnpublish?locale=en`, { documentIds: [adminPerson] }), 'credits this Team Member');
    refusedByAdmin('admin: Delete on a credited person is refused', await admin(`/collection-types/${personModel}/${adminPerson}?locale=en`, undefined, 'DELETE'), 'credits this Team Member');
    check('admin: the credited person is still published', await isPublished('team-member', adminPerson));
    await documents('project').update({ documentId: adminProject.id, locale: 'en', data: { credits: [] } });
    await documents('project').publish({ documentId: adminProject.id, locale: 'en' });
    const unpublished = await admin(`/collection-types/${personModel}/${adminPerson}/actions/unpublish?locale=en`, {});
    check('admin: Unpublish works once the Credit is gone', unpublished.status === 200 && !(await isPublished('team-member', adminPerson)), `got ${unpublished.status} ${unpublished.message}`);
  } finally {
    await removeFiles(strapi, uploaded);
    await strapi.destroy();
  }
};

run()
  .catch((error) => {
    failures.push(`crashed: ${error && error.stack ? error.stack : error}${error && error.details ? ` ${JSON.stringify(error.details)}` : ''}`);
  })
  .finally(async () => {
    try {
      await withMaintenanceDb(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
    } catch (error) {
      console.error(`Could not drop ${scratchName}:`, error.message);
    }
    if (failures.length > 0) {
      console.error(failures.map((message) => `FAIL ${message}`).join('\n'));
      console.error(`\n${failures.length} failed, ${passed} passed.`);
      process.exit(1);
    }
    console.log(`Publish rules check passed (${passed} checks).`);
    process.exit(0);
  });
