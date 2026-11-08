// Loads the versioned content in apps/cms/seed into an empty CMS. Documents are saved as drafts and then published
// through the Document Service, so the publish rules check the seed like any other content. Nothing here touches API
// tokens, because this also runs once against production, where regenerating one would cut off the web app.
const fs = require('fs');
const path = require('path');
const { parseBody } = require('./seed-body');
const { removeFiles, uploadFile } = require('./media');

const SEED_DIR = path.resolve(__dirname, '..', '..', 'seed');
const SEEDED_TYPES = ['typology', 'topic', 'team-member', 'service', 'project', 'article', 'page', 'home-page', 'studio-page', 'site-settings'];
const DRAWING_KINDS = ['plan', 'section', 'elevation'];
const SECTION_TYPES = ['statement', 'selected-projects', 'services-overview', 'latest-articles', 'studio-introduction', 'team', 'figures', 'contact-prompt'];

const uidOf = (type) => `api::${type}.${type}`;

const readSeed = (dir = SEED_DIR) => {
  const json = (name) => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));
  const problems = [];

  const bodyOf = (folder, slug, { required }) => {
    const file = path.join(dir, 'bodies', folder, `${slug}.md`);
    if (!fs.existsSync(file)) {
      if (required) problems.push(`${folder}/${slug}: no body file`);
      return [];
    }
    try {
      return parseBody(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      problems.push(`${folder}/${slug}: ${error.message}`);
      return [];
    }
  };
  const withBody = (folder, items, options) => items.map((item) => ({ ...item, body: bodyOf(folder, item.slug, options) }));

  const seed = {
    images: json('images'),
    typologies: json('typologies'),
    topics: json('topics'),
    teamMembers: json('team-members'),
    services: withBody('services', json('services'), { required: false }),
    projects: withBody('projects', json('projects'), { required: true }),
    articles: withBody('articles', json('articles'), { required: true }),
    pages: withBody('pages', json('pages'), { required: true }),
    homePage: json('home-page'),
    studioPage: json('studio-page'),
    siteSettings: json('site-settings'),
  };

  const used = new Set();
  const image = (file, where) => {
    used.add(file);
    if (!file || !seed.images[file]) problems.push(`${where}: the image ${file} is not in images.json`);
    else if (!seed.images[file].alt?.trim()) problems.push(`${where}: the image ${file} has no alt text`);
  };
  const ref = (known, key, where) => {
    if (!known.has(key)) problems.push(`${where}: nothing is called ${key}`);
  };
  const seo = (value, where) => {
    if (value?.shareImage) image(value.shareImage, `${where} share image`);
  };

  const unique = (items, key, what) => {
    const keys = items.map((item) => item[key]);
    keys.filter((value, index) => keys.indexOf(value) !== index).forEach((value) => problems.push(`${what}: ${value} appears twice`));
    return new Set(keys);
  };
  const typologies = unique(seed.typologies, 'slug', 'Typologies');
  const topics = unique(seed.topics, 'slug', 'Topics');
  const members = unique(seed.teamMembers, 'key', 'Team Members');
  const services = unique(seed.services, 'slug', 'Services');
  const projects = unique(seed.projects, 'slug', 'Projects');
  unique(seed.articles, 'slug', 'Articles');
  unique(seed.pages, 'slug', 'Pages');

  const body = (blocks, where) => {
    for (const block of blocks) {
      if (block.kind === 'image') image(block.file, where);
      if (block.kind === 'pair') {
        if (block.files.length !== 2) problems.push(`${where}: @pair needs two images`);
        block.files.forEach((file) => image(file, where));
      }
      if (block.kind === 'gallery') {
        if (block.files.length < 2) problems.push(`${where}: @gallery needs at least two images`);
        block.files.forEach((file) => image(file, where));
      }
      if (block.kind === 'quote') {
        ref(members, block.speaker, where);
        if (!block.text) problems.push(`${where}: @quote has no text`);
      }
      if (block.kind === 'drawing') {
        if (!DRAWING_KINDS.includes(block.drawing)) problems.push(`${where}: @drawing kind ${block.drawing} is not ${DRAWING_KINDS.join(', ')}`);
        if (!block.caption) problems.push(`${where}: @drawing needs a caption`);
        image(block.file, where);
      }
    }
  };
  const sections = (list, where) => {
    list.forEach((section, index) => {
      const place = `${where} section ${index + 1}`;
      if (!SECTION_TYPES.includes(section.type)) problems.push(`${place}: unknown type ${section.type}`);
      if (section.image) image(section.image, place);
      (section.projects ?? []).forEach((slug) => ref(projects, slug, place));
    });
  };

  seed.teamMembers.forEach((member) => image(member.portrait, `Team Member ${member.key}`));
  seed.services.forEach((service) => {
    const where = `Service ${service.slug}`;
    image(service.cover, where);
    body(service.body, where);
    seo(service.seo, where);
  });
  seed.projects.forEach((project) => {
    const where = `Project ${project.slug}`;
    image(project.cover, where);
    ref(typologies, project.typology, where);
    project.services.forEach((slug) => ref(services, slug, where));
    project.credits.forEach((credit) => ref(members, credit.teamMember, where));
    body(project.body, where);
    seo(project.seo, where);
  });
  seed.articles.forEach((article) => {
    const where = `Article ${article.slug}`;
    image(article.cover, where);
    ref(topics, article.topic, where);
    article.byline.forEach((key) => ref(members, key, where));
    article.relatedProjects.forEach((slug) => ref(projects, slug, where));
    body(article.body, where);
    seo(article.seo, where);
  });
  seed.pages.forEach((page) => {
    body(page.body, `Page ${page.slug}`);
    seo(page.seo, `Page ${page.slug}`);
  });
  sections(seed.homePage.sections, 'Home page');
  seo(seed.homePage.seo, 'Home page');
  sections(seed.studioPage.sections, 'Studio page');
  seo(seed.studioPage.seo, 'Studio page');
  seo(seed.siteSettings.defaultSeo, 'Site Settings');

  for (const file of Object.keys(seed.images)) {
    if (!used.has(file)) problems.push(`images.json: nothing uses ${file}`);
    const imagePath = path.join(dir, 'images', file);
    if (!fs.existsSync(imagePath)) {
      problems.push(`images.json: there is no file ${file}`);
      continue;
    }
    // Every image is uploaded as a JPEG, so another format saved under a .jpg name would get the wrong type.
    const start = fs.readFileSync(imagePath).subarray(0, 3);
    if (!start.equals(Buffer.from([0xff, 0xd8, 0xff]))) problems.push(`images: ${file} is not a JPEG`);
  }
  for (const file of fs.readdirSync(path.join(dir, 'images'))) {
    if (!seed.images[file]) problems.push(`images: ${file} is not in images.json`);
  }

  if (problems.length > 0) throw new Error(`The seed content is not valid:\n- ${problems.join('\n- ')}`);
  return seed;
};

const refuseIfNotEmpty = async (strapi) => {
  const present = [];
  for (const type of SEEDED_TYPES) {
    const count = await strapi.db.query(uidOf(type)).count();
    if (count > 0) present.push(`${type} (${count})`);
  }
  if (present.length > 0) throw new Error(`The seed only loads into an empty CMS, and this one already holds: ${present.join(', ')}.`);
};

const writeSeed = async (strapi, seed, dir, uploaded) => {
  const imageIds = new Map();
  for (const [file, { alt }] of Object.entries(seed.images)) {
    const stored = await uploadFile(strapi, path.join(dir, 'images', file), alt);
    uploaded.push(stored);
    imageIds.set(file, stored.id);
  }

  const refs = new Map();
  const refTo = (type, key) => refs.get(`${type}:${key}`);
  const save = async (type, key, data) => {
    const documents = strapi.documents(uidOf(type));
    const { documentId } = await documents.create({ locale: 'en', data });
    if (strapi.contentType(uidOf(type)).options.draftAndPublish) await documents.publish({ documentId, locale: 'en' });
    refs.set(`${type}:${key}`, documentId);
  };

  const figure = (file, caption) => ({ image: imageIds.get(file), alt: seed.images[file].alt, ...(caption ? { caption } : {}) });
  const seo = (value) => (value ? { ...value, shareImage: value.shareImage ? imageIds.get(value.shareImage) : undefined } : undefined);
  const blocks = (body) =>
    body.map((block) => {
      switch (block.kind) {
        case 'text':
          return { __component: 'blocks.text', body: block.nodes };
        case 'image':
          return { __component: 'blocks.image', ...figure(block.file, block.caption) };
        case 'pair':
          return { __component: 'blocks.image-pair', left: figure(block.files[0]), right: figure(block.files[1]) };
        case 'gallery':
          return { __component: 'blocks.gallery', items: block.files.map((file) => figure(file)) };
        case 'quote':
          return { __component: 'blocks.quote', text: block.text, speaker: refTo('team-member', block.speaker) };
        default:
          return { __component: 'blocks.drawing', kind: block.drawing, ...figure(block.file, block.caption) };
      }
    });
  const sections = (list) =>
    list.map(({ type, image, projects, ...fields }) => ({
      __component: `sections.${type}`,
      ...fields,
      ...(image ? { image: imageIds.get(image), imageAlt: seed.images[image].alt } : {}),
      ...(projects ? { projects: projects.map((slug) => refTo('project', slug)) } : {}),
    }));

  for (const typology of seed.typologies) await save('typology', typology.slug, typology);
  for (const topic of seed.topics) await save('topic', topic.slug, topic);
  for (const { key, portrait, ...member } of seed.teamMembers) await save('team-member', key, { ...member, portrait: imageIds.get(portrait) });
  for (const service of seed.services) {
    await save('service', service.slug, {
      ...service,
      cover: imageIds.get(service.cover),
      spaces: service.spaces.map((text) => ({ text })),
      scope: service.scope.map((text) => ({ text })),
      body: blocks(service.body),
      seo: seo(service.seo),
    });
  }
  for (const project of seed.projects) {
    await save('project', project.slug, {
      ...project,
      cover: imageIds.get(project.cover),
      typology: refTo('typology', project.typology),
      services: project.services.map((slug) => refTo('service', slug)),
      credits: project.credits.map(({ role, teamMember }) => ({ role, teamMember: refTo('team-member', teamMember) })),
      body: blocks(project.body),
      seo: seo(project.seo),
    });
  }
  for (const article of seed.articles) {
    await save('article', article.slug, {
      ...article,
      cover: imageIds.get(article.cover),
      topic: refTo('topic', article.topic),
      byline: article.byline.map((key) => refTo('team-member', key)),
      relatedProjects: article.relatedProjects.map((slug) => refTo('project', slug)),
      body: blocks(article.body),
      seo: seo(article.seo),
    });
  }
  for (const page of seed.pages) await save('page', page.slug, { ...page, body: blocks(page.body), seo: seo(page.seo) });
  await save('home-page', 'home', { sections: sections(seed.homePage.sections), seo: seo(seed.homePage.seo) });
  await save('studio-page', 'studio', { sections: sections(seed.studioPage.sections), seo: seo(seed.studioPage.seo) });
  await save('site-settings', 'settings', { ...seed.siteSettings, defaultSeo: seo(seed.siteSettings.defaultSeo) });
};

// One transaction, so a seed that fails halfway leaves the CMS empty and can simply be run again. Files in the
// bucket are outside the transaction, so they are removed by hand.
const loadSeed = async (strapi, { dir = SEED_DIR } = {}) => {
  const seed = readSeed(dir);
  await refuseIfNotEmpty(strapi);

  const uploaded = [];
  try {
    await strapi.db.transaction(() => writeSeed(strapi, seed, dir, uploaded));
  } catch (error) {
    await removeFiles(strapi, uploaded);
    throw error;
  }

  return { seed, files: uploaded.length };
};

module.exports = { SEED_DIR, SEEDED_TYPES, loadSeed, readSeed, uidOf };
