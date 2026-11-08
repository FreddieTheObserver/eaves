// Loads the versioned seed content into an empty CMS: local development and the first production load.
const path = require('path');
const { createStrapi, compileStrapi } = require('@strapi/strapi');
const { loadSeed } = require('./lib/seed');

const run = async () => {
  process.chdir(path.resolve(__dirname, '..'));
  const appContext = await compileStrapi();
  const strapi = await createStrapi(appContext).load();
  strapi.log.level = 'error';

  try {
    const { files } = await loadSeed(strapi);
    console.log(`Seed loaded (${files} images).`);
  } finally {
    await strapi.destroy();
  }
};

run().then(
  () => process.exit(0),
  (error) => {
    console.error(error.message);
    process.exit(1);
  }
);
