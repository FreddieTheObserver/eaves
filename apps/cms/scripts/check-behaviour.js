// Boots Strapi on a throwaway database and checks CMS behaviour through the routes the admin really calls,
// because a config handler registers and type-checks fine even when it builds the wrong URL.
// The route prefixes come from apps/web/src/content/rules.json, so the CMS cannot drift from them.
// It creates its own database on the server named by the usual DATABASE_* variables and drops it afterwards,
// so it never touches the development database.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg')
const { createStrapi, compileStrapi } = require('@strapi/strapi');

const appDir = path.resolve(__dirname, '..');
const webRules = JSON.parse(fs.readFileSync(path.resolve(appDir, '..', 'web', 'src', 'content', 'rules.json'), 'utf8'));
const scratchName = `eaves_behaviour_${process.pid}_${Date.now()}`;
const WEB_URL = 'https://web.example';
const PREVIEW_SECRET = 'behaviour-check-secret';

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

const uidOf = (type) => `api::${type}.${type}`;

const signIn = async (strapi, base) => {
  const superAdmin = await strapi.service('admin::role').getSuperAdmin();
  await strapi.service('admin::user').create({ email: 'admin@example.com', firstname: 'Admin', lastname: 'User', password: 'Passw0rd!admin', isActive: true, roles: [superAdmin.id] });
  const login = await fetch(`${base}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'Passw0rd!admin' }) });
  const { data } = await login.json();
  return data.token;
};

const checkPreview = async (strapi, base, token) => {
  const documents = (type) => strapi.documents(uidOf(type));
  const previewOf = async (type, params = {}) => {
    const response = await fetch(`${base}/content-manager/preview/url/${uidOf(type)}?${new URLSearchParams({ locale: 'en', ...params })}`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 204) return null;
    return new URL((await response.json()).data.url);
  };
  const pathIn = (url) => url?.searchParams.get('url');

  const slugged = {
    project: { title: 'Linden House', slug: 'linden-house' },
    service: { name: 'Interiors', slug: 'interiors', spaces: [{ text: 'Houses' }], scope: [{ text: 'Space planning' }] },
    article: { title: 'On Light', slug: 'on-light' },
    page: { title: 'Privacy', slug: 'privacy' },
  };
  for (const [type, data] of Object.entries(slugged)) {
    const { documentId } = await documents(type).create({ locale: 'en', data });
    const url = await previewOf(type, { documentId, status: 'draft' });
    check(`${type} previews at its route`, pathIn(url) === `${webRules.routes[type]}${data.slug}`, String(url));
  }

  const { documentId: linkId } = await documents('page').create({ locale: 'en', data: { title: 'Link', slug: 'link' } });
  const link = await previewOf('page', { documentId: linkId, status: 'draft' });
  check('the link goes to the preview route of the web app', link?.origin === WEB_URL && link?.pathname === '/api/preview', String(link));
  check('the link carries the secret and the status', link?.searchParams.get('secret') === PREVIEW_SECRET && link?.searchParams.get('status') === 'draft', String(link));

  await documents('team-member').create({ locale: 'en', data: { name: 'Person', position: 'Designer', bio: 'Bio', order: 1 } });
  const member = await documents('team-member').findFirst({ locale: 'en' });
  check('a Team Member previews on the Studio page', pathIn(await previewOf('team-member', { documentId: member.documentId, status: 'draft' })) === '/studio');
  for (const [type, want] of [['home-page', '/'], ['studio-page', '/studio'], ['site-settings', '/']]) {
    await documents(type).create({ locale: 'en', data: {} });
    check(`${type} previews at ${want}`, pathIn(await previewOf(type, { status: 'draft' })) === want);
  }

  const noPage = {
    typology: { name: 'Residential', slug: 'residential' },
    topic: { name: 'Materials', slug: 'materials' },
    inquiry: { name: 'Visitor', email: 'visitor@example.com', kind: 'other', message: 'Hello', consent: true },
    'slug-history': { oldPath: '/projects/old', targetType: 'project', targetDocumentId: 'abc' },
  };
  for (const [type, data] of Object.entries(noPage)) {
    const { documentId } = await documents(type).create({ data });
    check(`${type} has no preview`, (await previewOf(type, { documentId })) === null);
  }

  const { documentId } = await documents('page').create({ locale: 'en', data: { title: 'Renamed', slug: 'old-slug' } });
  await documents('page').publish({ documentId, locale: 'en' });
  await documents('page').update({ documentId, locale: 'en', data: { slug: 'new-slug' } });
  check('the draft tab uses the draft slug', pathIn(await previewOf('page', { documentId, status: 'draft' })) === '/new-slug');
  check('the published tab uses the published slug', pathIn(await previewOf('page', { documentId, status: 'published' })) === '/old-slug');

  const { documentId: unpublished } = await documents('page').create({ locale: 'en', data: { title: 'Never published', slug: 'never' } });
  check('a document with no published version has no published preview', (await previewOf('page', { documentId: unpublished, status: 'published' })) === null);

  const policy = (await fetch(`${base}/_health`)).headers.get('content-security-policy') || '';
  check('the admin may frame the web app', new RegExp(`frame-src[^;]*${WEB_URL}`).test(policy), policy);
};

const run = async () => {
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
    WEB_URL,
    PREVIEW_SECRET,
  });

  const strapi = await createStrapi(appContext).start();
  strapi.log.level = 'error';

  try {
    const base = `http://127.0.0.1:${strapi.server.httpServer.address().port}`;
    await checkPreview(strapi, base, await signIn(strapi, base));
  } finally {
    await strapi.destroy();
  }
};

run()
  .catch((error) => {
    failures.push(`crashed: ${error && error.stack ? error.stack : error}`);
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
    console.log(`Behaviour check passed (${passed} checks).`);
    process.exit(0);
  });
