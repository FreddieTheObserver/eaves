// Boots Strapi on a throwaway database and checks the access setup end to end: the Editor and Author
// permissions, the empty Public role, the three API tokens, the draft gate, and CORS over real HTTP.
// The gate needs this test because it type-checks and registers fine even when it lets every request
// through (Strapi's policy context drops the Koa query getter), so only a request proves it works.
// It creates its own database on the server named by the usual DATABASE_* variables and drops it
// afterwards, so it never touches the development database.
const path = require('path');
const { Client } = require('pg');
const { createStrapi, compileStrapi } = require('@strapi/strapi');

const appDir = path.resolve(__dirname, '..');
const scratchName = `eaves_access_${process.pid}_${Date.now()}`;
const WEB_ORIGIN = 'https://web.example';

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

const sorted = (list) => [...list].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const asSubjects = (permissions, action) =>
  permissions.filter((p) => p.action === `plugin::content-manager.explorer.${action}`).map((p) => p.subject.replace(/^api::[^.]+\./, ''));

const checkRoles = async (strapi) => {
  const rolePermissions = (code) => strapi.db.query('admin::permission').findMany({ where: { role: { code } } });
  const editor = await rolePermissions('strapi-editor');
  const author = await rolePermissions('strapi-author');

  check('Editor cannot delete anything', !editor.some((p) => p.action.endsWith('.delete')));
  check(
    'Editor publishes the eight publishable types',
    same(asSubjects(editor, 'publish'), ['article', 'home-page', 'page', 'project', 'service', 'site-settings', 'studio-page', 'team-member']),
    asSubjects(editor, 'publish').join()
  );
  check('Editor reads Inquiries', asSubjects(editor, 'read').includes('inquiry'));
  check('Editor cannot create Inquiries or Slug history', !asSubjects(editor, 'create').some((s) => ['inquiry', 'slug-history'].includes(s)));
  check('Editor updates Site Settings', asSubjects(editor, 'update').includes('site-settings'));
  check('Editor creates Typologies and Topics', ['typology', 'topic'].every((s) => asSubjects(editor, 'create').includes(s)));
  const projectCreate = editor.find((p) => p.action.endsWith('explorer.create') && p.subject === 'api::project.project');
  check('Editor project permission covers fields in every locale', projectCreate?.properties?.fields?.length > 5 && projectCreate.properties.locales === null);

  check('Author cannot publish or delete', !author.some((p) => p.action.endsWith('.publish') || p.action.endsWith('.delete')));
  check('Author has no Inquiry access', !author.some((p) => p.subject === 'api::inquiry.inquiry'));
  check('Author creates and updates only Articles', same(asSubjects(author, 'create'), ['article']) && same(asSubjects(author, 'update'), ['article']));
  check('Author reads Articles and the entries they link to', same(asSubjects(author, 'read'), ['article', 'project', 'team-member', 'topic']));
  const find = (action, subject) => author.find((p) => p.action.endsWith(`explorer.${action}`) && p.subject === subject);
  const ownOnly = ['admin::is-creator'];
  check('Author reads and updates only their own Articles', same(find('read', 'api::article.article')?.conditions || [], ownOnly) && same(find('update', 'api::article.article')?.conditions || [], ownOnly));
  check('Author reads Team Members without a condition', (find('read', 'api::team-member.team-member')?.conditions || []).length === 0);
  check(
    'Author cannot write the Publication date but can read it',
    !find('create', 'api::article.article')?.properties?.fields?.includes('publicationDate') &&
      !find('update', 'api::article.article')?.properties?.fields?.includes('publicationDate') &&
      find('read', 'api::article.article')?.properties?.fields?.includes('publicationDate')
  );

  const publicRole = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'public' } });
  check('Public role has no permissions', (await strapi.db.query('plugin::users-permissions.permission').count({ where: { role: publicRole.id } })) === 0);

  return { editor: editor.length, author: author.length };
};

const checkTokens = async (strapi) => {
  const tokens = await strapi.db.query('admin::api-token').findMany({ populate: ['permissions'] });
  const byName = Object.fromEntries(tokens.map((t) => [t.name, t]));
  const actions = (name) => (byName[name]?.permissions || []).map((p) => p.action);

  check('Only the Read, Draft, and Inquiry tokens exist', same(Object.keys(byName), ['Read', 'Draft', 'Inquiry']), Object.keys(byName).join());
  check('Read has only find and findOne, on 19 routes', actions('Read').length === 19 && actions('Read').every((a) => /\.(find|findOne)$/.test(a)));
  check('Draft has the same permissions as Read', same(actions('Draft'), actions('Read')));
  check('Inquiry can only create Inquiries', same(actions('Inquiry'), ['api::inquiry.inquiry.create']));
  check('Every token is custom and never expires', tokens.every((t) => t.type === 'custom' && t.lifespan == null));

  return { tokens: tokens.length, tokenPermissions: tokens.reduce((n, t) => n + t.permissions.length, 0), byName };
};

const checkHttp = async (strapi, tokenIds) => {
  const base = `http://127.0.0.1:${strapi.server.httpServer.address().port}`;
  const service = strapi.service('admin::api-token');
  const key = async (name) => (await service.regenerate(tokenIds[name])).accessKey;
  const [read, draft, inquiry] = [await key('Read'), await key('Draft'), await key('Inquiry')];

  const documents = strapi.documents('api::team-member.team-member');
  const doc = await documents.create({ locale: 'en', data: { name: 'Person', position: 'Designer', bio: 'Bio', order: 1 } });

  const json = { 'Content-Type': 'application/json' };
  const inquiryBody = JSON.stringify({ data: { name: 'Visitor', email: 'visitor@example.com', kind: 'other', message: 'Hello', consent: true } });
  const expectStatus = async (label, url, token, want, init = {}) => {
    const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) };
    const got = (await fetch(base + url, { ...init, headers })).status;
    const wants = [].concat(want);
    check(`${label} returns ${wants.join(' or ')}`, wants.includes(got), `got ${got}`);
  };

  await expectStatus('Read token lists published content', '/api/team-members', read, 200);
  await expectStatus('Read token accepts status=published', '/api/team-members?status=published', read, 200);
  await expectStatus('Read token cannot list drafts', '/api/team-members?status=draft', read, 403);
  await expectStatus('Read token cannot fetch one draft', `/api/team-members/${doc.documentId}?status=draft`, read, 403);
  await expectStatus('Read token cannot read a single type draft', '/api/site-settings?status=draft', read, 403);
  await expectStatus('Read token cannot mix published and draft', '/api/team-members?status=published&status=draft', read, [400, 403]);
  await expectStatus('Draft token lists drafts', '/api/team-members?status=draft', draft, 200);
  await expectStatus('Draft token fetches one draft', `/api/team-members/${doc.documentId}?status=draft`, draft, 200);
  await expectStatus('Read token cannot list Inquiries', '/api/inquiries', read, 404);
  await expectStatus('Read token cannot create an Inquiry', '/api/inquiries', read, 403, { method: 'POST', headers: json, body: inquiryBody });
  await expectStatus('Inquiry token creates an Inquiry', '/api/inquiries', inquiry, 201, { method: 'POST', headers: json, body: inquiryBody });
  await expectStatus('Inquiry token cannot read Inquiries', '/api/inquiries', inquiry, 404);
  await expectStatus('Inquiry token cannot read content', '/api/team-members', inquiry, 403);
  await expectStatus('A request without a token is refused', '/api/team-members', null, [401, 403]);
  await expectStatus('Public registration is closed', '/api/auth/local/register', null, [401, 403], {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ username: 'visitor', email: 'visitor@example.com', password: 'Passw0rd!visitor' }),
  });
  const allowedOrigin = async (origin) => (await fetch(`${base}/_health`, { headers: { Origin: origin } })).headers.get('access-control-allow-origin');
  check('CORS allows the web app origin', (await allowedOrigin(WEB_ORIGIN)) === WEB_ORIGIN);
  check('CORS refuses every other origin', (await allowedOrigin('https://other.example')) === null);
};

const run = async () => {
  await withMaintenanceDb(`CREATE DATABASE "${scratchName}"`);

  Object.assign(process.env, {
    DATABASE_CLIENT: 'postgres',
    DATABASE_NAME: scratchName,
    DATABASE_URL: '',
    HOST: '127.0.0.1',
    PORT: '0',
    STRAPI_TELEMETRY_DISABLED: 'true',
    CORS_ORIGINS: WEB_ORIGIN,
  });
  process.chdir(appDir);

  const appContext = await compileStrapi();
  const strapi = await createStrapi(appContext).start();
  strapi.log.level = 'error';

  try {
    const roles = await checkRoles(strapi);
    const tokens = await checkTokens(strapi);
    await checkHttp(strapi, { Read: tokens.byName.Read.id, Draft: tokens.byName.Draft.id, Inquiry: tokens.byName.Inquiry.id });

    // Running the bootstrap again must change nothing, because it runs on every start.
    const { reconcileAccess } = require(path.join(appContext.distDir, 'src', 'access'));
    await reconcileAccess(strapi);
    const rolesAgain = await checkRoles(strapi);
    const tokensAgain = await checkTokens(strapi);
    check(
      'A second bootstrap changes no permissions or tokens',
      JSON.stringify([roles, tokens.tokens, tokens.tokenPermissions]) === JSON.stringify([rolesAgain, tokensAgain.tokens, tokensAgain.tokenPermissions])
    );
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
    console.log(`Access check passed (${passed} checks).`);
    process.exit(0);
  });
