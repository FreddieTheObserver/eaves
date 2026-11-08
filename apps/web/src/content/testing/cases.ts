import { z } from 'zod';
import {
  articleCardSchema,
  articleDraftSchema,
  articleSchema,
  collection,
  inquiryCreatedSchema,
  pageDraftSchema,
  pageSchema,
  projectCardSchema,
  projectDraftSchema,
  projectSchema,
  sectionsPageDraftSchema,
  sectionsPageSchema,
  serviceDraftSchema,
  serviceSchema,
  single,
  siteSettingsDraftSchema,
  siteSettingsSchema,
  slugHistorySchema,
  teamMemberDraftSchema,
  teamMemberSchema,
  topicSchema,
  typologySchema,
} from '../schemas';

// Every recorded response, with the strict schema that reads it as published content and the lenient
// schema that reads it as a draft. A fixture with no lenient schema belongs to a type without Draft and Publish.
export type Published = { strict: z.ZodType; lenient?: z.ZodType };

export const published: Record<string, Published> = {
  'project-list': { strict: collection(projectCardSchema, 'Project') },
  'project-published': { strict: collection(projectSchema, 'Project'), lenient: collection(projectDraftSchema, 'Project') },
  'service-list': { strict: collection(serviceSchema, 'Service'), lenient: collection(serviceDraftSchema, 'Service') },
  'team-member-list': { strict: collection(teamMemberSchema, 'Team Member'), lenient: collection(teamMemberDraftSchema, 'Team Member') },
  'typology-list': { strict: collection(typologySchema, 'Typology') },
  'topic-list': { strict: collection(topicSchema, 'Topic') },
  'article-list': { strict: collection(articleCardSchema, 'Article') },
  'article-published': { strict: collection(articleSchema, 'Article'), lenient: collection(articleDraftSchema, 'Article') },
  'page-published': { strict: collection(pageSchema, 'Page'), lenient: collection(pageDraftSchema, 'Page') },
  'home-page-published': { strict: single(sectionsPageSchema), lenient: single(sectionsPageDraftSchema) },
  'studio-page-published': { strict: single(sectionsPageSchema), lenient: single(sectionsPageDraftSchema) },
  'site-settings-published': { strict: single(siteSettingsSchema), lenient: single(siteSettingsDraftSchema) },
  'slug-history-lookup': { strict: collection(slugHistorySchema, 'Slug history entry') },
  'inquiry-created': { strict: inquiryCreatedSchema },
};

export type Draft = { strict: z.ZodType; lenient: z.ZodType };

export const drafts: Record<string, Draft> = {
  'project-draft': { strict: single(projectSchema), lenient: single(projectDraftSchema) },
  'service-draft': { strict: single(serviceSchema), lenient: single(serviceDraftSchema) },
  'team-member-draft': { strict: single(teamMemberSchema), lenient: single(teamMemberDraftSchema) },
  'article-draft': { strict: single(articleSchema), lenient: single(articleDraftSchema) },
  'page-draft': { strict: single(pageSchema), lenient: single(pageDraftSchema) },
  'home-page-draft': { strict: single(sectionsPageSchema), lenient: single(sectionsPageDraftSchema) },
  'studio-page-draft': { strict: single(sectionsPageSchema), lenient: single(sectionsPageDraftSchema) },
  'site-settings-draft': { strict: single(siteSettingsSchema), lenient: single(siteSettingsDraftSchema) },
};

// Reads every document of a list with no tolerance, so a test sees exactly why one is refused. The web app
// reads lists with collection, which drops that document instead.
export const documents = <T extends z.ZodType>(item: T) => z.object({ data: z.array(item) });

// Published documents that Strapi accepted but that break a rule on the document itself, so the document
// is refused. Each issue is the path inside the document and a piece of the message.
export type Refusal = { item: z.ZodType; what: string; lenient: z.ZodType; issues: [path: string, message: string][] };

export const refusals: Record<string, Refusal> = {
  'project-without-relations': {
    item: projectSchema,
    what: 'Project',
    lenient: collection(projectDraftSchema, 'Project'),
    issues: [
      ['typology', 'must have a Typology'],
      ['services', 'at least one Service'],
    ],
  },
  'project-cover-without-alt': {
    item: projectSchema,
    what: 'Project',
    lenient: collection(projectDraftSchema, 'Project'),
    issues: [['cover.alternativeText', 'Alternative text is required']],
  },
  'article-without-relations': {
    item: articleSchema,
    what: 'Article',
    lenient: collection(articleDraftSchema, 'Article'),
    issues: [
      ['topic', 'must have a Topic'],
      ['byline', 'at least one Team Member'],
    ],
  },
  'page-reserved-slug': {
    item: pageSchema,
    what: 'Page',
    lenient: collection(pageDraftSchema, 'Page'),
    issues: [['slug', 'reserved for a route']],
  },
};

// Published documents that are fine themselves but hold an item that breaks a rule, so the item is dropped
// and the rest is kept. Each drop is where the item sat and why, and keeps is what must still be there.
export type ItemDrop = { strict: z.ZodType; lenient: z.ZodType; dropped: [where: string, reasons: string[]][]; keeps: object };

const SELECTED_PROJECTS = 'projects: Selected Projects needs between three and six Projects';

export const itemDrops: Record<string, ItemDrop> = {
  'project-credit-unpublished-member': {
    strict: collection(projectSchema, 'Project'),
    lenient: collection(projectDraftSchema, 'Project'),
    dropped: [['Project[0] > Credit[0]', ['teamMember: A Credit must name a Team Member']]],
    keeps: { items: [{ slug: 'orphan-credit-house', credits: [] }] },
  },
  'home-page-violations': {
    strict: single(sectionsPageSchema),
    lenient: single(sectionsPageDraftSchema),
    dropped: [['Section[1]', [SELECTED_PROJECTS]]],
    keeps: { sections: [{ type: 'statement' }] },
  },
  'studio-page-violations': {
    strict: single(sectionsPageSchema),
    lenient: single(sectionsPageDraftSchema),
    dropped: [['Section[0]', [SELECTED_PROJECTS]]],
    keeps: { sections: [] },
  },
};

// Recorded responses that look wrong but pass: the strict schema cannot see what Strapi removed.
export const silentDrops: Record<string, Published> = {
  'article-unpublished-byline': { strict: collection(articleSchema, 'Article'), lenient: collection(articleDraftSchema, 'Article') },
};
