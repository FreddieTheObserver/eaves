// Boots Strapi on a throwaway database, loads the seed through the same code as pnpm seed, and reads it back over
// real HTTP with the populate specs the web app uses. The responses then go through the web app's strict schemas,
// because a broken item is dropped without an error and Strapi leaves unpublished relations out without a word.
// It creates its own database on the server named by the usual DATABASE_* variables and drops it afterwards, and it
// removes what it uploads, so it never touches the development database.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Client } = require('pg');
const { ListObjectsV2Command, S3Client } = require('@aws-sdk/client-s3');
const { createStrapi, compileStrapi } = require('@strapi/strapi');
const { removeFiles } = require('./lib/media');
const { SEED_DIR, SEEDED_TYPES, loadSeed, readSeed, uidOf } = require('./lib/seed');

const appDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(appDir, '..', '..');
const contentDir = path.resolve(appDir, '..', 'web', 'src', 'content');
const scratchName = `eaves_seed_${process.pid}_${Date.now()}`;
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eaves-seed-'));

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

const refusal = (promise) =>
  promise.then(
    () => null,
    (error) => error
  );

const toQuery = (value, prefix = '') => {
  if (Array.isArray(value)) return value.flatMap((item, i) => toQuery(item, `${prefix}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => toQuery(item, prefix ? `${prefix}[${key}]` : key));
  return [`${encodeURIComponent(prefix)}=${encodeURIComponent(value)}`];
};

const objectsInBucket = async () => {
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
  });
  const { Contents = [] } = await client.send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET }));
  return Contents.length;
};

const documentCount = async (strapi) => {
  let total = 0;
  for (const type of SEEDED_TYPES) total += await strapi.db.query(uidOf(type)).count();
  return total;
};
const fileCount = (strapi) => strapi.db.query('plugin::upload.file').count();

// A reserved slug passes the seed's own validation and is refused by a publish rule near the end, after images and
// most documents are written.
const checkFailureLeavesNothing = async (strapi, objectsBefore) => {
  const dir = path.join(workDir, 'broken-seed');
  fs.cpSync(SEED_DIR, dir, { recursive: true });
  const pages = JSON.parse(fs.readFileSync(path.join(dir, 'pages.json'), 'utf8'));
  fs.renameSync(path.join(dir, 'bodies', 'pages', `${pages[0].slug}.md`), path.join(dir, 'bodies', 'pages', 'projects.md'));
  pages[0].slug = 'projects';
  fs.writeFileSync(path.join(dir, 'pages.json'), JSON.stringify(pages));

  const error = await refusal(loadSeed(strapi, { dir }));
  check('a seed that fails halfway reports why', error !== null && /reserved/.test(error.message), error ? error.message : 'it did not fail');
  check('and leaves no documents', (await documentCount(strapi)) === 0, String(await documentCount(strapi)));
  check('and leaves no file records', (await fileCount(strapi)) === 0, String(await fileCount(strapi)));
  check('and leaves nothing in the bucket', (await objectsInBucket()) === objectsBefore, `${await objectsInBucket()} objects, was ${objectsBefore}`);
};

const fetchResponses = async (strapi, base) => {
  const { id } = await strapi.db.query('admin::api-token').findOne({ where: { name: 'Read' } });
  const { accessKey } = await strapi.service('admin::api-token').regenerate(id);
  const populate = JSON.parse(fs.readFileSync(path.join(contentDir, 'populate.json'), 'utf8'));
  const requests = JSON.parse(fs.readFileSync(path.join(contentDir, 'fixtures', 'requests.json'), 'utf8'));
  const names = ['project-list', 'project-published', 'service-list', 'team-member-list', 'typology-list', 'topic-list', 'article-list', 'article-published', 'page-published', 'home-page-published', 'studio-page-published', 'site-settings-published'];

  const responses = {};
  for (const name of names) {
    const entry = requests.find((request) => request.name === name);
    const { filters, pagination, ...query } = entry.query;
    const isList = entry.path !== '/api/home-page' && entry.path !== '/api/studio-page' && entry.path !== '/api/site-settings';
    const params = { ...query, ...(entry.populate ? { populate: populate[entry.populate] } : {}), ...(isList ? { pagination: { page: 1, pageSize: 100 } } : {}) };
    const response = await fetch(`${base}${entry.path}?${toQuery(params).join('&')}`, { headers: { Authorization: `Bearer ${accessKey}` } });
    const body = await response.text();
    check(`${name} can be read`, response.ok, `got ${response.status}: ${body.slice(0, 300)}`);
    responses[name] = JSON.parse(body);
  }
  return responses;
};

const checkLoaded = (seed, responses) => {
  const counts = [
    ['Typologies', 'typology-list', seed.typologies],
    ['Topics', 'topic-list', seed.topics],
    ['Team Members', 'team-member-list', seed.teamMembers],
    ['Services', 'service-list', seed.services],
    ['Projects', 'project-published', seed.projects],
    ['Project cards', 'project-list', seed.projects],
    ['Articles', 'article-published', seed.articles],
    ['Article cards', 'article-list', seed.articles],
    ['Pages', 'page-published', seed.pages],
  ];
  for (const [what, name, items] of counts) {
    check(`every one of the ${what} is published`, responses[name].meta.pagination.total === items.length && responses[name].data.length === items.length, `${responses[name].data.length} of ${items.length}`);
  }

  const bySlug = (name) => new Map(responses[name].data.map((document) => [document.slug, document]));
  const projects = bySlug('project-published');
  for (const project of seed.projects) {
    const loaded = projects.get(project.slug);
    check(`${project.slug} keeps every Service`, loaded?.services.length === project.services.length, `${loaded?.services.length} of ${project.services.length}`);
    const named = loaded?.credits.filter((credit) => credit.teamMember).length;
    check(`${project.slug} keeps every Credit`, named === project.credits.length, `${named} of ${project.credits.length}`);
  }
  const articles = bySlug('article-published');
  for (const article of seed.articles) {
    const loaded = articles.get(article.slug);
    check(`${article.slug} keeps every Byline`, loaded?.byline.length === article.byline.length, `${loaded?.byline.length} of ${article.byline.length}`);
    check(`${article.slug} keeps every related Project`, loaded?.relatedProjects.length === article.relatedProjects.length, `${loaded?.relatedProjects.length} of ${article.relatedProjects.length}`);
  }
  for (const [name, source] of [['home-page-published', seed.homePage], ['studio-page-published', seed.studioPage]]) {
    const wanted = source.sections.filter((section) => section.projects);
    const loaded = responses[name].data.sections.filter((section) => section.__component === 'sections.selected-projects');
    wanted.forEach((section, index) => check(`${name} keeps every Selected Project`, loaded[index]?.projects.length === section.projects.length, `${loaded[index]?.projects.length} of ${section.projects.length}`));
    check(`${name} keeps every Section`, responses[name].data.sections.length === source.sections.length);
  }
};

const checkWithWebSchemas = (responses) => {
  const dir = path.join(workDir, 'responses');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, response] of Object.entries(responses)) fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(response));

  const report = path.join(workDir, 'vitest.json');
  const result = spawnSync('pnpm', ['--filter', '@eaves/web', 'exec', 'vitest', 'run', 'src/content/seed.test.ts', '--reporter=json', `--outputFile=${report}`], {
    cwd: repoDir,
    env: { ...process.env, SEED_RESPONSES: dir },
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (!fs.existsSync(report)) {
    check('the web schemas ran', false, (result.stderr || result.stdout || '').slice(0, 800));
    return;
  }

  const { numTotalTests, numPendingTests, numFailedTests, testResults } = JSON.parse(fs.readFileSync(report, 'utf8'));
  check('the web schemas ran', numTotalTests === Object.keys(responses).length && numPendingTests === 0, `${numTotalTests} tests, ${numPendingTests} skipped`);
  check('nothing in the seed is dropped by the web schemas', numFailedTests === 0, `${numFailedTests} failed`);
  for (const file of testResults) {
    for (const test of file.assertionResults) {
      if (test.status === 'failed') failures.push(`web schema: ${test.title}: ${String(test.failureMessages[0]).slice(0, 700)}`);
    }
  }
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
    REVALIDATE_URL: '',
  });

  const strapi = await createStrapi(appContext).start();
  strapi.log.level = 'error';

  let objectsBefore;
  try {
    const base = `http://127.0.0.1:${strapi.server.httpServer.address().port}`;
    objectsBefore = await objectsInBucket();

    await checkFailureLeavesNothing(strapi, objectsBefore);

    const { seed, files } = await loadSeed(strapi);
    check('every image is uploaded', files === Object.keys(seed.images).length && (await fileCount(strapi)) === files, `${files} of ${Object.keys(seed.images).length}`);

    const again = await refusal(loadSeed(strapi));
    check('a second run is refused', again !== null && /empty CMS/.test(again.message), again ? again.message : 'it loaded twice');
    check('and changes nothing', (await fileCount(strapi)) === files);

    const responses = await fetchResponses(strapi, base);
    checkLoaded(seed, responses);
    checkWithWebSchemas(responses);

    for (const file of Object.keys(seed.images)) check(`${file} is still in the repository`, fs.existsSync(path.join(SEED_DIR, 'images', file)));
    readSeed();
  } finally {
    try {
      await removeFiles(strapi, await strapi.db.query('plugin::upload.file').findMany());
      if (objectsBefore !== undefined) check('the bucket is left as it was found', (await objectsInBucket()) === objectsBefore, `${await objectsInBucket()} objects, was ${objectsBefore}`);
    } catch (error) {
      failures.push(`could not clean up: ${error.message}`);
    }
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
    fs.rmSync(workDir, { recursive: true, force: true });
    if (failures.length > 0) {
      console.error(failures.map((message) => `FAIL ${message}`).join('\n'));
      console.error(`\n${failures.length} failed, ${passed} passed.`);
      process.exit(1);
    }
    console.log(`Seed check passed (${passed} checks).`);
    process.exit(0);
  });
