import type { Core } from '@strapi/strapi';
import { SELECTED_PROJECTS } from './content-rules';
import { documentIds, named, publishedWhere, type Doc, type Locale } from './published';

// The CMS refuses what the web app's schemas refuse.
// Strapi removes an unpublished or deleted document from the published relations that point at it, so these
// checks find the published documents that would be left breaking a rule in apps/web/src/content/schemas.
// A relation the web app does not require is left out on purpose: a Quote speaker, a related Project, and a
// Byline person who is not the last one just disappear from the published pages that show them.

type Dependency = (strapi: Core.Strapi, id: string, locale: Locale) => Promise<string[]>;

const PROJECT = 'api::project.project';
const ARTICLE = 'api::article.article';

const creditedProjects: Dependency = async (strapi, id, locale) =>
  (await publishedWhere(strapi, PROJECT, { locale, fields: ['title'], filters: { credits: { teamMember: { documentId: id } } } })).map(
    (project) => `Project ${named(project)} credits this Team Member.`
  );

const articlesLeftWithoutByline: Dependency = async (strapi, id, locale) =>
  (await publishedWhere(strapi, ARTICLE, { locale, fields: ['title'], populate: ['byline'], filters: { byline: { documentId: id } } }))
    .filter((article) => documentIds(article.byline).every((member) => member === id))
    .map((article) => `Article ${named(article)} would have no one in its Byline.`);

const projectsLeftWithoutService: Dependency = async (strapi, id, locale) =>
  (await publishedWhere(strapi, PROJECT, { locale, fields: ['title'], populate: ['services'], filters: { services: { documentId: id } } }))
    .filter((project) => documentIds(project.services).every((service) => service === id))
    .map((project) => `Project ${named(project)} would have no Service.`);

const projectsLeftWithoutTypology: Dependency = async (strapi, id, locale) =>
  (await publishedWhere(strapi, PROJECT, { locale, fields: ['title'], filters: { typology: { documentId: id } } })).map(
    (project) => `Project ${named(project)} would have no Typology.`
  );

const articlesLeftWithoutTopic: Dependency = async (strapi, id, locale) =>
  (await publishedWhere(strapi, ARTICLE, { locale, fields: ['title'], filters: { topic: { documentId: id } } })).map(
    (article) => `Article ${named(article)} would have no Topic.`
  );

const SECTION_PAGES: [uid: string, label: string][] = [
  ['api::home-page.home-page', 'the Home page'],
  ['api::studio-page.studio-page', 'the Studio page'],
];

const selectedProjectsLeftTooShort: Dependency = async (strapi, id, locale) => {
  const problems: string[] = [];
  for (const [uid, label] of SECTION_PAGES) {
    const pages = await publishedWhere(strapi, uid, {
      locale,
      populate: { sections: { on: { 'sections.selected-projects': { populate: ['projects'] } } } },
    });
    for (const page of pages) {
      for (const section of Array.isArray(page.sections) ? (page.sections as Doc[]) : []) {
        if (section.__component !== 'sections.selected-projects') continue;
        const chosen = documentIds(section.projects);
        if (chosen.includes(id) && chosen.length - 1 < SELECTED_PROJECTS.min) {
          problems.push(`Selected Projects on ${label} would have ${chosen.length - 1} Projects, and it needs at least ${SELECTED_PROJECTS.min}.`);
        }
      }
    }
  }
  return problems;
};

// Typology and Topic have no draft and publish, so only deleting them can break a published page.
const DEPENDENCIES: Record<string, Dependency[]> = {
  'api::team-member.team-member': [creditedProjects, articlesLeftWithoutByline],
  'api::service.service': [projectsLeftWithoutService],
  [PROJECT]: [selectedProjectsLeftTooShort],
  'api::typology.typology': [projectsLeftWithoutTypology],
  'api::topic.topic': [articlesLeftWithoutTopic],
};

export const dependentProblems = async (strapi: Core.Strapi, uid: string, documentId: string | undefined, locale: Locale): Promise<string[]> => {
  const checks = DEPENDENCIES[uid];
  if (!checks || !documentId) return [];

  const problems: string[] = [];
  for (const check of checks) problems.push(...(await check(strapi, documentId, locale)));
  return problems;
};

export const describeDocument = async (strapi: Core.Strapi, uid: string, documentId: string, locale: Locale): Promise<string> => {
  if (Array.isArray(locale) || locale === '*') return documentId;
  const document = (await strapi.documents(uid as never).findOne({ documentId, locale } as never)) as Doc | null;
  return document ? named(document) : documentId;
};
