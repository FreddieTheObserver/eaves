// Boots Strapi on a throwaway database and checks the publish rules (src/publish-rules): a document whose
// cover, portrait or Section image has no alt text cannot be published. It tests the Document Service and
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

    const admin = async (route, body) => {
      const response = await fetch(`${base}/content-manager${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify(body),
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
