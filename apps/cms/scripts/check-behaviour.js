// Boots Strapi on a throwaway database and checks CMS behaviour over real HTTP: Preview links, Slug history, the
// Inquiry rate limit, and the revalidation webhook. Each registers and type-checks fine even when it does the wrong thing.
// The route prefixes come from apps/web/src/content/rules.json, so the CMS cannot drift from them.
// It creates its own database on the server named by the usual DATABASE_* variables and drops it afterwards,
// so it never touches the development database.

const fs = require('fs');
const http = require('http');
const path = require('path');
const { Client } = require('pg');
const { createStrapi, compileStrapi } = require('@strapi/strapi');
const { removeFiles, uploadImage } = require('./lib/media');

const appDir = path.resolve(__dirname, '..');
const webRules = JSON.parse(fs.readFileSync(path.resolve(appDir, '..', 'web', 'src', 'content', 'rules.json'), 'utf8'));
const scratchName = `eaves_behaviour_${process.pid}_${Date.now()}`;
const WEB_URL = 'https://web.example';
const PREVIEW_SECRET = 'behaviour-check-secret';
const REVALIDATE_SECRET = 'behaviour-check-revalidate';

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

const checkSlugHistory = async (strapi, base, token) => {
  const pages = strapi.documents(uidOf('page'));
  const history = strapi.documents(uidOf('slug-history'));
  const pathsFor = async (documentId) => (await history.findMany({ filters: { targetDocumentId: documentId } })).map((row) => row.oldPath).sort().join();
  const rowAt = (oldPath) => history.findFirst({ filters: { oldPath } });
  const saveSlug = (documentId, slug) => pages.update({ documentId, locale: 'en', data: { slug } });
  const publish = (documentId) => pages.publish({ documentId, locale: 'en' });
  const newPage = async (slug) => {
    const { documentId } = await pages.create({ locale: 'en', data: { title: `Page ${slug}`, slug } });
    await publish(documentId);
    return documentId;
  };
  const rename = async (documentId, slug) => {
    await saveSlug(documentId, slug);
    await publish(documentId);
  };
  const admin = (route, body) =>
    fetch(`${base}/content-manager/collection-types/${encodeURIComponent(uidOf('page'))}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

  const page = await newPage('first-slug');
  check('a first publish records nothing', (await pathsFor(page)) === '');

  await saveSlug(page, 'unpublished-slug');
  check('saving a draft records nothing', (await pathsFor(page)) === '');

  await rename(page, 'second-slug');
  const row = await rowAt('/first-slug');
  check('a published rename records the old path', row?.targetType === 'page' && row?.targetDocumentId === page, JSON.stringify(row));

  await pages.update({ documentId: page, locale: 'en', data: { title: 'A new title' } });
  await publish(page);
  check('publishing with the same slug records nothing new', (await pathsFor(page)) === '/first-slug', await pathsFor(page));

  await rename(page, 'third-slug');
  check('every old path points at the document', (await pathsFor(page)) === '/first-slug,/second-slug', await pathsFor(page));

  await rename(page, 'second-slug');
  check('renaming back makes the path live again', (await pathsFor(page)) === '/first-slug,/third-slug', await pathsFor(page));
  await rename(page, 'third-slug');
  check('renaming there and back again still works', (await pathsFor(page)) === '/first-slug,/second-slug', await pathsFor(page));

  const newcomer = await newPage('first-slug');
  check('a page that takes over an old path clears its redirect', (await rowAt('/first-slug')) === null);

  const moved = await newPage('held-path');
  await history.create({ data: { oldPath: '/held-path', targetType: 'page', targetDocumentId: 'someone-else' } });
  await rename(moved, 'free-path');
  check('an existing record for the old path is repointed', (await rowAt('/held-path'))?.targetDocumentId === moved);

  const refused = await newPage('stays-put');
  await saveSlug(refused, 'projects');
  const refusal = await publish(refused).then(
    () => null,
    (error) => error
  );
  check('a refused publish records nothing', refusal !== null && (await pathsFor(refused)) === '', await pathsFor(refused));

  const viaAdmin = await newPage('before-admin');
  const response = await admin(`/${viaAdmin}/actions/publish?locale=en`, { title: 'Via the admin', slug: 'after-admin' });
  check('the admin Publish button records the old path', response.status === 200 && (await rowAt('/before-admin'))?.targetDocumentId === viaAdmin, `got ${response.status}`);

  const viaBulk = await newPage('before-bulk');
  await saveSlug(viaBulk, 'after-bulk');
  const bulk = await admin('/actions/bulkPublish?locale=en', { documentIds: [viaBulk] });
  check('bulk publish records the old path', bulk.status === 200 && (await rowAt('/before-bulk'))?.targetDocumentId === viaBulk, `got ${bulk.status}`);

  await pages.delete({ documentId: page, locale: 'en' });
  check('deleting a document removes its records', (await pathsFor(page)) === '', await pathsFor(page));
  await pages.delete({ documentId: newcomer, locale: 'en' });
};

const checkInquiryRateLimit = async (strapi, base) => {
  const LIMIT = 5;
  const WINDOW_MINUTES = 10;
  const keyOf = async (name) => {
    const { id } = await strapi.db.query('admin::api-token').findOne({ where: { name } });
    return (await strapi.service('admin::api-token').regenerate(id)).accessKey;
  };
  const [inquiryToken, readToken] = [await keyOf('Inquiry'), await keyOf('Read')];
  const body = JSON.stringify({ data: { name: 'Visitor', email: 'visitor@example.com', kind: 'other', message: 'Hello', consent: true } });
  const send = (ip, token = inquiryToken) =>
    fetch(`${base}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(ip ? { 'x-visitor-ip': ip } : {}) },
      body,
    });
  const statusOf = async (ip, token) => (await send(ip, token)).status;
  const repeat = async (times, ip, token) => {
    const statuses = [];
    for (let i = 0; i < times; i++) statuses.push(await statusOf(ip, token));
    return statuses;
  };
  const stored = () => strapi.db.query('api::inquiry.inquiry').count();

  const before = await stored();
  check('a request without the visitor IP is refused', (await statusOf()) === 400);
  check('a request with a malformed visitor IP is refused', (await statusOf('not-an-ip')) === 400);
  check('a refused request creates no Inquiry', (await stored()) === before);

  const allowed = await repeat(LIMIT, '203.0.113.10');
  check('a visitor can send up to the limit', allowed.every((status) => status === 201), allowed.join());
  const blocked = await send('203.0.113.10');
  check('the next request from that visitor is refused', blocked.status === 429, `got ${blocked.status}`);
  check('the refusal says when to try again', Number(blocked.headers.get('retry-after')) > 0, blocked.headers.get('retry-after') ?? 'none');
  check('a refused request is not stored', (await stored()) === before + LIMIT);
  check('another visitor is not affected', (await statusOf('203.0.113.11')) === 201);
  check('an IPv6 visitor is accepted', (await statusOf('2001:db8::1')) === 201);

  const wrongToken = await repeat(LIMIT + 1, '203.0.113.12', readToken);
  check('a token that cannot create Inquiries is refused first', wrongToken.every((status) => status === 403), wrongToken.join());
  check('and does not use up the visitor allowance', (await statusOf('203.0.113.12')) === 201);

  const rows = await strapi.db.query('api::inquiry.inquiry').findMany();
  check('the visitor IP is not stored with the Inquiry', !JSON.stringify(rows).includes('203.0.113.'));

  const realNow = Date.now;
  Date.now = () => realNow() + (WINDOW_MINUTES + 1) * 60 * 1000;
  try {
    check('the visitor can send again after the window', (await statusOf('203.0.113.10')) === 201);
  } finally {
    Date.now = realNow;
  }
};

const startReceiver = () =>
  new Promise((resolve) => {
    const received = [];
    const receiver = http.createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        received.push({ authorization: request.headers.authorization, body: JSON.parse(body) });
        response.end();
      });
    });
    receiver.listen(0, '127.0.0.1', () => resolve({ receiver, received, url: `http://127.0.0.1:${receiver.address().port}/api/revalidate` }));
  });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const checkWebhook = async (strapi, received, reconcile) => {
  const documents = (type) => strapi.documents(uidOf(type));
  const eventsIn = (deliveries) => deliveries.map((delivery) => delivery.body.event).join();

  // Webhooks are sent after the change that caused them, so a Topic created now marks when the earlier ones are in.
  let marks = 0;
  const deliveries = async () => {
    marks++;
    const mark = await documents('topic').create({ locale: 'en', data: { name: `Mark ${marks}`, slug: `mark-${marks}` } });
    for (let i = 0; i < 200 && !received.some((delivery) => delivery.body.entry?.documentId === mark.documentId); i++) await wait(25);
    await wait(100);
    return received.splice(0).filter((delivery) => delivery.body.entry?.documentId !== mark.documentId);
  };
  await deliveries();

  const { documentId } = await documents('page').create({ locale: 'en', data: { title: 'Webhook', slug: 'webhook' } });
  check('creating a draft sends nothing', (await deliveries()).length === 0);
  await documents('page').update({ documentId, locale: 'en', data: { title: 'Webhook edited' } });
  check('saving a draft sends nothing', (await deliveries()).length === 0);

  await documents('page').publish({ documentId, locale: 'en' });
  const published = await deliveries();
  check('a publish sends exactly one webhook', eventsIn(published) === 'entry.publish', eventsIn(published));
  check('the webhook carries the secret', published[0]?.authorization === `Bearer ${REVALIDATE_SECRET}`);
  check('the webhook names the document', published[0]?.body.uid === uidOf('page') && published[0]?.body.entry?.documentId === documentId);

  await documents('page').unpublish({ documentId, locale: 'en' });
  const unpublished = await deliveries();
  check('an unpublish sends one webhook', eventsIn(unpublished) === 'entry.unpublish', eventsIn(unpublished));
  await documents('page').delete({ documentId, locale: 'en' });
  const deleted = await deliveries();
  check('a delete sends a webhook', deleted.length > 0 && deleted.every((delivery) => delivery.body.event === 'entry.delete'), eventsIn(deleted));

  await documents('inquiry').create({ data: { name: 'Visitor', email: 'private@example.com', kind: 'other', message: 'Private', consent: true } });
  const afterInquiry = await deliveries();
  check('an Inquiry sends nothing', afterInquiry.length === 0, eventsIn(afterInquiry));

  const typology = await documents('typology').create({ locale: 'en', data: { name: 'Webhook typology', slug: 'webhook-typology' } });
  check('creating a Typology sends a webhook', eventsIn(await deliveries()) === 'entry.create');
  await documents('typology').update({ documentId: typology.documentId, locale: 'en', data: { name: 'Renamed typology' } });
  check('updating a Typology sends a webhook', eventsIn(await deliveries()) === 'entry.update');
  await documents('typology').delete({ documentId: typology.documentId, locale: 'en' });
  check('deleting a Typology sends a webhook', eventsIn(await deliveries()) === 'entry.delete');

  const file = await uploadImage(strapi, 'webhook', { width: 64, height: 48 });
  const uploaded = await deliveries();
  check('uploading an image sends a webhook', eventsIn(uploaded) === 'media.create', eventsIn(uploaded));
  await removeFiles(strapi, [file]);
  const removed = await deliveries();
  check('deleting an image sends a webhook', eventsIn(removed) === 'media.delete', eventsIn(removed));

  const moved = await documents('page').create({ locale: 'en', data: { title: 'Moved', slug: 'moved-before' } });
  await documents('page').publish({ documentId: moved.documentId, locale: 'en' });
  await deliveries();
  await documents('page').update({ documentId: moved.documentId, locale: 'en', data: { slug: 'moved-after' } });
  await documents('page').publish({ documentId: moved.documentId, locale: 'en' });
  const afterMove = await deliveries();
  check('a slug change tells the web app about the new redirect', afterMove.some((delivery) => delivery.body.uid === uidOf('slug-history') && delivery.body.event === 'entry.create'), eventsIn(afterMove));

  await reconcile(strapi);
  check('a second bootstrap keeps one webhook', (await strapi.get('webhookStore').findWebhooks()).length === 1);
  const again = await documents('page').create({ locale: 'en', data: { title: 'Again', slug: 'again' } });
  await documents('page').publish({ documentId: again.documentId, locale: 'en' });
  const afterSecondBootstrap = await deliveries();
  check('a second bootstrap does not send twice', eventsIn(afterSecondBootstrap) === 'entry.publish', eventsIn(afterSecondBootstrap));

  delete process.env.REVALIDATE_URL;
  await reconcile(strapi);
  check('without a URL there is no webhook', (await strapi.get('webhookStore').findWebhooks()).length === 0);
  const last = await documents('page').create({ locale: 'en', data: { title: 'Last', slug: 'last' } });
  await documents('page').publish({ documentId: last.documentId, locale: 'en' });
  await wait(300);
  check('without a URL a publish sends nothing', received.length === 0, String(received.length));
};

const run = async () => {
  process.chdir(appDir);
  const appContext = await compileStrapi();

  await withMaintenanceDb(`CREATE DATABASE "${scratchName}"`);
  const { receiver, received, url } = await startReceiver();

  Object.assign(process.env, {
    DATABASE_CLIENT: 'postgres',
    DATABASE_NAME: scratchName,
    DATABASE_URL: '',
    HOST: '127.0.0.1',
    PORT: '0',
    STRAPI_TELEMETRY_DISABLED: 'true',
    WEB_URL,
    PREVIEW_SECRET,
    REVALIDATE_URL: url,
    REVALIDATE_SECRET,
  });

  const strapi = await createStrapi(appContext).start();
  strapi.log.level = 'error';

  try {
    const base = `http://127.0.0.1:${strapi.server.httpServer.address().port}`;
    const token = await signIn(strapi, base);
    await checkPreview(strapi, base, token);
    await checkSlugHistory(strapi, base, token);
    await checkInquiryRateLimit(strapi, base);
    const { reconcileRevalidationWebhook } = require(path.join(appContext.distDir, 'src', 'webhooks'));
    await checkWebhook(strapi, received, reconcileRevalidationWebhook);
  } finally {
    await strapi.destroy();
    receiver.close();
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
