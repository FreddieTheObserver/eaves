// Boots Strapi on a throwaway database, creates a small set of documents, and records the real REST
// responses that apps/web/src/content validates its zod schemas against. It records three kinds of
// document: valid ones, half-filled drafts, and published ones that break the rules Strapi cannot
// enforce (required relations, Selected Projects count, reserved slugs, and a cover whose alt text is
// cleared in the Media Library after publishing). The last kind shows what Strapi sends for such content.
// The CMS refuses to publish those states (src/publish-rules), so every document here is saved as a draft
// and published while valid, and the recorder then breaks its published row in the database, as a transfer,
// a seed or a bug could. The requests come from apps/web/src/content/fixtures/requests.json and their
// populate specs from apps/web/src/content/populate.json.
// Fixtures are committed snapshots, so run this by hand (pnpm record:fixtures) when a content type changes.
// It creates its own database on the server named by the usual DATABASE_* variables and drops it afterwards.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { createStrapi, compileStrapi } = require('@strapi/strapi');
const { removeFiles, uploadImage } = require('./lib/media');

const appDir = path.resolve(__dirname, '..');
const contentDir = path.resolve(appDir, '..', 'web', 'src', 'content');
const fixturesDir = path.join(contentDir, 'fixtures');
const populate = JSON.parse(fs.readFileSync(path.join(contentDir, 'populate.json'), 'utf8'));
const requests = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'requests.json'), 'utf8'));
const scratchName = `eaves_fixtures_${process.pid}_${Date.now()}`;

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

const toQuery = (value, prefix = '') => {
  if (Array.isArray(value)) return value.flatMap((item, i) => toQuery(item, `${prefix}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => toQuery(item, prefix ? `${prefix}[${key}]` : key));
  return [`${encodeURIComponent(prefix)}=${encodeURIComponent(value)}`];
};

const text = (value, marks = {}) => ({ type: 'text', text: value, ...marks });
const richText = [
  { type: 'heading', level: 2, children: [text('Material first')] },
  {
    type: 'paragraph',
    children: [
      text('Oak, lime plaster and '),
      text('woven cane', { bold: true }),
      text(' set the tone, '),
      text('softly', { italic: true }),
      text(' and '),
      text('plainly', { underline: true }),
      text(', '),
      text('not loudly', { strikethrough: true }),
      text('. See '),
      text('plan-a', { code: true }),
      text(' or '),
      { type: 'link', url: 'https://example.com/materials', children: [text('the palette')] },
      text('.'),
    ],
  },
  { type: 'list', format: 'unordered', children: [{ type: 'list-item', children: [text('Oak joinery')] }, { type: 'list-item', children: [text('Lime plaster')] }] },
  { type: 'list', format: 'ordered', children: [{ type: 'list-item', children: [text('Measure')] }, { type: 'list-item', children: [text('Draw')] }] },
  { type: 'quote', children: [text('Rooms should breathe.')] },
  { type: 'code', children: [text('plan-a')] },
];

// Ids, timestamps, upload hashes and byte sizes change on every run, so they are replaced with stable
// values. Re-recording an unchanged content type then produces no diff, and a diff is a real change.
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const normalize = (value, aliases, key) => {
  if (Array.isArray(value)) return value.map((item) => normalize(item, aliases));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, child]) => [name, normalize(child, aliases, name)]));
  if (typeof value === 'number') return key === 'size' || key === 'sizeInBytes' ? 0 : value;
  if (typeof value !== 'string') return value;
  if (key === 'documentId' || key === 'targetDocumentId') {
    if (!(value in aliases)) throw new Error(`The document ${value} has no alias; create it with create() or upload()`);
    return aliases[value];
  }
  return value
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, FIXED_TIME)
    .replace(/(covered|portrait|silent)_[0-9a-f]{10}/g, '$1_0000000000');
};

let passed = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? ` (${detail})` : ''}`);
};

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
    const tokenService = strapi.service('admin::api-token');
    const keys = {};
    for (const token of await strapi.db.query('admin::api-token').findMany()) {
      keys[token.name.toLowerCase()] = (await tokenService.regenerate(token.id)).accessKey;
    }

    const refs = {};
    const uidOf = (name) => `api::${name}.${name}`;
    const create = async (alias, name, data, { draft = false } = {}) => {
      const model = strapi.contentType(uidOf(name));
      const options = {};
      if (strapi.plugin('i18n').service('content-types').isLocalizedContentType(model)) options.locale = 'en';
      const documents = strapi.documents(uidOf(name));
      const document = await documents.create({ ...options, data });
      refs[alias] = document.documentId;
      if (model.options.draftAndPublish && !draft) await documents.publish({ documentId: document.documentId, ...options });
      return document;
    };
    const revise = async (name, data, { publish = false } = {}) => {
      const documents = strapi.documents(uidOf(name));
      const [current] = await documents.findMany({ locale: 'en', status: 'draft' });
      await documents.update({ documentId: current.documentId, locale: 'en', data });
      if (publish) await documents.publish({ documentId: current.documentId, locale: 'en' });
    };

    // A later publish copies the draft over the published row, so a document is broken after its last publish.
    const publishedRow = (name, alias, populate) =>
      strapi.db.query(uidOf(name)).findOne({ where: { documentId: refs[alias], publishedAt: { $notNull: true } }, populate });
    const breakPublished = async (name, alias, data) => {
      const row = await publishedRow(name, alias);
      await strapi.db.query(uidOf(name)).update({ where: { id: row.id }, data });
    };
    const clearCreditMember = async (alias) => {
      const row = await publishedRow('project', alias, { credits: true });
      await strapi.db.query('shared.credit').update({ where: { id: row.credits[0].id }, data: { teamMember: null } });
    };
    const keepSelectedProjects = async (name, alias, count) => {
      const row = await publishedRow(name, alias, { sections: true });
      const { id } = row.sections.find((section) => section.__component === 'sections.selected-projects');
      const section = await strapi.db.query('sections.selected-projects').findOne({ where: { id }, populate: { projects: true } });
      await strapi.db.query('sections.selected-projects').update({ where: { id }, data: { projects: section.projects.slice(0, count).map((project) => project.id) } });
    };

    const upload = async (key, color, alternativeText) => {
      const file = await uploadImage(strapi, key, { color, alternativeText });
      uploaded.push(file);
      refs[`file-${key}`] = file.documentId;
      return file;
    };
    const covered = (await upload('covered', [214, 200, 178], 'A sunlit living room with oak shelving')).id;
    const portrait = (await upload('portrait', [120, 110, 100], 'Head and shoulders of a designer in a linen shirt')).id;
    const silent = await upload('silent', [90, 100, 110], 'Temporary alt text');
    const figure = (caption) => ({ image: covered, alt: 'Oak stair rising past a lime plaster wall', ...(caption ? { caption } : {}) });
    const seo = { metaTitle: 'Linden House', metaDescription: 'A fictional house by a fictional studio.', shareImage: covered };

    const blocks = (speaker) => [
      { __component: 'blocks.text', body: richText },
      { __component: 'blocks.image', image: covered, alt: 'Deep eaves over a timber terrace', caption: 'The terrace at noon' },
      { __component: 'blocks.image-pair', left: figure('Left'), right: figure() },
      { __component: 'blocks.gallery', items: [figure(), figure('Second view')] },
      { __component: 'blocks.quote', text: 'Rooms should breathe.', speaker },
      { __component: 'blocks.drawing', kind: 'plan', image: covered, alt: 'Ground floor plan with a central courtyard', caption: 'Ground floor plan' },
    ];

    await create('residential', 'typology', { name: 'Residential', slug: 'residential' });
    await create('commercial', 'typology', { name: 'Commercial', slug: 'commercial' });
    await create('material', 'topic', { name: 'Material', slug: 'material' });
    await create('process', 'topic', { name: 'Process', slug: 'process' });

    await create('designerOne', 'team-member', { name: 'Designer One', position: 'Design Director', bio: 'Leads the studio.', portrait, order: 1 });
    await create('designerTwo', 'team-member', { name: 'Designer Two', position: 'Interior Designer', bio: 'Specifies materials.', portrait, order: 2 });
    await create('designerDraft', 'team-member', { name: 'Designer Three', position: 'Architectural Designer', bio: 'Not yet published.', portrait, order: 3 }, { draft: true });

    await create('serviceResidential', 'service', {
      name: 'Residential Interior Design',
      slug: 'residential-interior-design',
      summary: 'Interiors for houses and condominiums.',
      cover: covered,
      spaces: [{ text: 'Houses' }, { text: 'Condominiums' }],
      scope: [{ text: 'Space planning' }, { text: '3D visualization' }],
      body: blocks(),
      order: 1,
      seo,
    });

    const projectBase = (title, slug, extra) => ({
      title,
      slug,
      summary: `${title}, a fictional project.`,
      cover: covered,
      neighbourhood: 'Ari',
      city: 'Bangkok',
      year: 2024,
      floorArea: 180,
      stage: 'completed',
      typology: refs.residential,
      services: [refs.serviceResidential],
      ...extra,
    });
    await create('projectLinden', 'project', projectBase('Linden House', 'linden-house', {
      year: 2025,
      floorArea: 220,
      body: blocks(refs.designerOne),
      credits: [{ role: 'Lead designer', teamMember: refs.designerOne }, { role: 'Interior designer', teamMember: refs.designerTwo }],
      seo,
    }));
    await create('projectMill', 'project', projectBase('Mill Lane Cafe', 'mill-lane-cafe', { year: 2024, stage: 'under_construction', typology: refs.commercial }));
    await create('projectRiver', 'project', projectBase('River Studio', 'river-studio', { year: 2023, stage: 'concept' }));

    await create('articleOak', 'article', {
      title: 'Oak and light',
      slug: 'oak-and-light',
      excerpt: 'How a plain material sets the mood of a room.',
      cover: covered,
      body: blocks(refs.designerOne),
      byline: [refs.designerOne, refs.designerTwo],
      topic: refs.material,
      relatedProjects: [refs.projectLinden],
      publicationDate: '2026-03-12',
      seo,
    });

    await create('pagePrivacy', 'page', { title: 'Privacy', slug: 'privacy', body: [{ __component: 'blocks.text', body: richText }], seo });

    const statement = { __component: 'sections.statement', text: 'We design rooms that keep cool and dry.', image: covered, imageAlt: 'Deep timber eaves over a courtyard' };
    await create('homePage', 'home-page', {
      sections: [
        statement,
        { __component: 'sections.selected-projects', heading: 'Selected projects', projects: [refs.projectLinden, refs.projectMill, refs.projectRiver] },
        { __component: 'sections.services-overview', heading: 'Design services', intro: 'Five services, one studio.' },
        { __component: 'sections.latest-articles', heading: 'From the journal' },
        { __component: 'sections.studio-introduction', heading: 'The studio', text: 'A small Bangkok studio.', image: covered, imageAlt: 'The studio library', linkLabel: 'About the studio' },
        { __component: 'sections.team', heading: 'People', intro: 'Designers, all of them.' },
        { __component: 'sections.figures', heading: 'In numbers', items: [{ value: '12', label: 'Years in practice' }, { value: '40', label: 'Homes designed' }] },
        { __component: 'sections.contact-prompt', heading: 'Start a conversation', text: 'Tell us about your space.', linkLabel: 'Contact us' },
      ],
      seo,
    });
    await create('studioPage', 'studio-page', {
      sections: [
        { __component: 'sections.statement', text: 'A studio that designs for its climate.' },
        { __component: 'sections.team', heading: 'People' },
        { __component: 'sections.contact-prompt', heading: 'Talk to us', linkLabel: 'Contact us' },
      ],
      seo,
    });
    await create('siteSettings', 'site-settings', {
      contactEmail: 'hello@example.com',
      contactLocation: 'Bangkok, Thailand',
      socialLinks: [{ label: 'Instagram', href: 'https://example.com/eaves' }],
      headerNavigation: [{ label: 'Projects', href: '/projects' }, { label: 'Journal', href: '/journal' }],
      footerNavigation: [{ label: 'Privacy', href: '/privacy' }],
      demoNotice: 'Eaves is a fictional studio and every image is AI-generated.',
      notFoundTitle: 'Page not found',
      notFoundText: 'The page you are looking for does not exist.',
      defaultSeo: seo,
    });
    await create('slugHistory', 'slug-history', { oldPath: '/projects/old-linden', targetType: 'project', targetDocumentId: refs.projectLinden });

    const send = async (entry) => {
      const query = { ...(entry.query || {}) };
      if (entry.populate) query.populate = populate[entry.populate];
      const queryString = toQuery(query).join('&');
      const route = entry.path.replace(/\{(\w+)\}/g, (_, alias) => {
        if (!(alias in refs)) throw new Error(`${entry.name}: no document called ${alias}`);
        return refs[alias];
      });
      const response = await fetch(`${base}${route}${queryString ? `?${queryString}` : ''}`, {
        method: entry.method || 'GET',
        headers: { Authorization: `Bearer ${keys[entry.token]}`, ...(entry.body ? { 'Content-Type': 'application/json' } : {}), ...(entry.headers || {}) },
        body: entry.body ? JSON.stringify(entry.body) : undefined,
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`${entry.name} returned ${response.status}: ${body.slice(0, 600)}`);
      const parsed = JSON.parse(body);
      if (entry.method === 'POST') refs[entry.name] = parsed.data.documentId;
      const aliases = Object.fromEntries(Object.entries(refs).map(([alias, id]) => [id, alias]));
      fs.writeFileSync(path.join(fixturesDir, `${entry.name}.json`), `${JSON.stringify(normalize(parsed, aliases), null, 2)}\n`);
      return parsed;
    };
    const recordPhase = async (phase) => {
      const out = {};
      for (const entry of requests.filter((candidate) => candidate.phase === phase)) out[entry.name] = await send(entry);
      return out;
    };

    const valid = await recordPhase('valid');
    check('The published Project list holds three Projects', valid['project-list'].data.length === 3);
    check('The Project detail response lists exactly one Project', valid['project-published'].data.length === 1);

    await create('projectDraft', 'project', { title: 'Half-written project' }, { draft: true });
    await create('serviceDraft', 'service', { name: 'Half-written service', spaces: [{ text: 'Houses' }], scope: [{ text: 'Space planning' }] }, { draft: true });
    await create('teamMemberDraft', 'team-member', { name: 'Half-written person' }, { draft: true });
    await create('articleDraft', 'article', { title: 'Half-written article' }, { draft: true });
    await create('pageDraft', 'page', { title: 'Half-written page' }, { draft: true });
    await revise('home-page', {
      sections: [
        { __component: 'sections.statement' },
        { __component: 'sections.selected-projects', projects: [refs.projectLinden] },
        { __component: 'sections.contact-prompt' },
      ],
      seo: null,
    });
    await revise('studio-page', { sections: [{ __component: 'sections.studio-introduction', heading: 'The studio' }] });
    await revise('site-settings', { demoNotice: null, notFoundText: null, defaultSeo: null });
    await recordPhase('drafts');

    await create('projectBare', 'project', projectBase('Bare House', 'bare-house', { summary: 'No relations.', year: 2022, floorArea: 90 }));
    await breakPublished('project', 'projectBare', { typology: null, services: [] });
    await create('projectSilent', 'project', projectBase('Silent House', 'silent-house', { cover: silent.id }));
    // The publish rule checks a document when it is published, not when a file it uses is edited later.
    // The Media Library edits through updateFileInfo, and an empty string is how it clears alt text.
    await strapi.plugin('upload').service('upload').updateFileInfo(silent.id, { alternativeText: '' });
    await create('articleBare', 'article', { title: 'Bare article', slug: 'bare-article', excerpt: 'No relations.', cover: covered, publicationDate: '2026-02-01', topic: refs.material, byline: [refs.designerOne] });
    await breakPublished('article', 'articleBare', { topic: null, byline: [] });
    await create('articleSecondByline', 'article', {
      title: 'Second byline',
      slug: 'second-byline',
      excerpt: 'One credited person has not been published.',
      cover: covered,
      byline: [refs.designerOne, refs.designerDraft],
      topic: refs.process,
      publicationDate: '2026-02-15',
    });
    // Strapi keeps a Credit whose Team Member has no published version, with the Team Member left out.
    await create('projectOrphanCredit', 'project', projectBase('Orphan Credit House', 'orphan-credit-house', { credits: [{ role: 'Lead designer', teamMember: refs.designerOne }] }));
    await clearCreditMember('projectOrphanCredit');
    await create('pageJournal', 'page', { title: 'Journal', slug: 'journal-page', body: [{ __component: 'blocks.text', body: richText }] });
    await strapi.db.query(uidOf('page')).updateMany({ where: { documentId: refs.pageJournal }, data: { slug: 'journal' } });
    await revise(
      'home-page',
      {
        sections: [
          { __component: 'sections.statement', text: 'A statement with no image.' },
          { __component: 'sections.selected-projects', heading: 'Selected projects', projects: [refs.projectLinden, refs.projectMill, refs.projectRiver] },
        ],
        seo,
      },
      { publish: true }
    );
    await keepSelectedProjects('home-page', 'homePage', 2);
    await revise(
      'studio-page',
      { sections: [{ __component: 'sections.selected-projects', heading: 'Selected projects', projects: [refs.projectLinden, refs.projectMill, refs.projectRiver] }], seo },
      { publish: true }
    );
    await keepSelectedProjects('studio-page', 'studioPage', 1);
    const violations = await recordPhase('violations');

    const first = (name) => violations[name].data[0];
    check('The published Project has no Typology and no Services', first('project-without-relations').typology == null && (first('project-without-relations').services || []).length === 0);
    check('A Media Library edit can clear the alt text of a published cover', !first('project-cover-without-alt').cover.alternativeText);
    check('The published Article has no Byline and no Topic', first('article-without-relations').topic == null && (first('article-without-relations').byline || []).length === 0);
    check('Strapi drops an unpublished Team Member from a published Byline', first('article-unpublished-byline').byline.length === 1, `got ${first('article-unpublished-byline').byline.length}`);
    const orphan = first('project-credit-unpublished-member').credits;
    check('The published Credit has no Team Member', orphan.length === 1 && orphan[0].teamMember == null, JSON.stringify(orphan));
    check('The published Page has a reserved slug', first('page-reserved-slug').slug === 'journal');
    const selectedProjects = (page) => violations[page].data.sections.find((section) => section.__component === 'sections.selected-projects');
    check('The published Selected Projects has two Projects', selectedProjects('home-page-violations').projects.length === 2);
    check('The published Selected Projects on the Studio page has one Project', selectedProjects('studio-page-violations').projects.length === 1);
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
    console.log(`Recorded ${requests.length} fixtures into ${path.relative(process.cwd(), fixturesDir) || fixturesDir} (${passed} checks).`);
    process.exit(0);
  });
