// Boots Strapi and compares each content type's effective localization with DESIGN.md section 7.
// Strapi treats any field without `localized: true` as shared (relations and uid fields are always
// per language), and a missing flag fails silently, so this is the guard against one slipping through.
// It needs a reachable database, taken from the usual DATABASE_* variables.
const fs = require('fs');
const path = require('path');
const { createStrapi, compileStrapi } = require('@strapi/strapi');

const appDir = path.resolve(__dirname, '..');

// Attributes that stay shared across languages. Every other attribute must be per language.
const LOCALIZED_TYPES = {
  typology: { shared: [], draftAndPublish: false },
  topic: { shared: [], draftAndPublish: false },
  service: { shared: ['cover', 'order'], draftAndPublish: true },
  'team-member': { shared: ['portrait', 'order'], draftAndPublish: true },
  project: { shared: ['cover', 'year', 'floorArea', 'stage'], draftAndPublish: true },
  article: { shared: ['cover', 'publicationDate'], draftAndPublish: true },
  page: { shared: [], draftAndPublish: true },
  'home-page': { shared: [], draftAndPublish: true },
  'studio-page': { shared: [], draftAndPublish: true },
  'site-settings': { shared: [], draftAndPublish: true },
};
const UNLOCALIZED_TYPES = ['inquiry', 'slug-history'];

const sorted = (list) => [...list].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const failures = [];
const fail = (message) => failures.push(message);

const run = async () => {
  process.chdir(appDir);
  const strapi = await createStrapi(await compileStrapi()).load();
  strapi.log.level = 'error';
  const i18n = strapi.plugin('i18n').service('content-types');

  const registered = Object.keys(strapi.contentTypes)
    .filter((uid) => uid.startsWith('api::'))
    .map((uid) => uid.split('.')[1]);
  for (const name of registered) {
    if (!(name in LOCALIZED_TYPES) && !UNLOCALIZED_TYPES.includes(name)) {
      fail(`${name} is not listed in scripts/check-schema.js: decide whether it is localized and add it`);
    }
  }

  for (const [name, expected] of Object.entries(LOCALIZED_TYPES)) {
    const uid = `api::${name}.${name}`;
    const model = strapi.contentType(uid);
    if (!model) {
      fail(`${uid} is not registered`);
      continue;
    }
    if (!i18n.isLocalizedContentType(model)) fail(`${uid} is not localized`);
    if (Boolean(model.options.draftAndPublish) !== expected.draftAndPublish) {
      fail(`${uid} draftAndPublish should be ${expected.draftAndPublish}`);
    }
    const shared = i18n.getNonLocalizedAttributes(model);
    if (!same(shared, expected.shared)) {
      fail(`${uid} shares [${sorted(shared)}] across languages, expected [${sorted(expected.shared)}]`);
    }
  }

  for (const name of UNLOCALIZED_TYPES) {
    const model = strapi.contentType(`api::${name}.${name}`);
    if (!model) fail(`api::${name}.${name} is not registered`);
    else if (i18n.isLocalizedContentType(model)) fail(`api::${name}.${name} must not be localized`);
    else if (model.options.draftAndPublish) fail(`api::${name}.${name} must not have draft and publish`);
  }

  const componentsDir = path.join(appDir, 'src', 'components');
  const onDisk = fs
    .readdirSync(componentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      fs.readdirSync(path.join(componentsDir, entry.name)).map((file) => `${entry.name}.${file.replace(/\.json$/, '')}`)
    );
  if (!same(Object.keys(strapi.components), onDisk)) fail('registered components differ from the files in src/components');

  await strapi.destroy();
};

run()
  .then(() => {
    if (failures.length > 0) {
      console.error(failures.map((message) => `FAIL ${message}`).join('\n'));
      process.exit(1);
    }
    console.log('Schema check passed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Schema check crashed:', error);
    process.exit(2);
  });
