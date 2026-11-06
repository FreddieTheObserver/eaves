import type { z } from 'zod';
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
  'project-list': { strict: collection(projectCardSchema) },
  'project-published': { strict: collection(projectSchema), lenient: collection(projectDraftSchema) },
  'service-list': { strict: collection(serviceSchema), lenient: collection(serviceDraftSchema) },
  'team-member-list': { strict: collection(teamMemberSchema), lenient: collection(teamMemberDraftSchema) },
  'typology-list': { strict: collection(typologySchema) },
  'topic-list': { strict: collection(topicSchema) },
  'article-list': { strict: collection(articleCardSchema) },
  'article-published': { strict: collection(articleSchema), lenient: collection(articleDraftSchema) },
  'page-published': { strict: collection(pageSchema), lenient: collection(pageDraftSchema) },
  'home-page-published': { strict: single(sectionsPageSchema), lenient: single(sectionsPageDraftSchema) },
  'studio-page-published': { strict: single(sectionsPageSchema), lenient: single(sectionsPageDraftSchema) },
  'site-settings-published': { strict: single(siteSettingsSchema), lenient: single(siteSettingsDraftSchema) },
  'slug-history-lookup': { strict: collection(slugHistorySchema) },
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

// Published documents that Strapi accepted but the content rules refuse. Each issue is the path the strict
// schema reports and a piece of its message.
export type Violation = { strict: z.ZodType; lenient: z.ZodType; issues: [path: string, message: string][] };

export const violations: Record<string, Violation> = {
  'project-without-relations': {
    strict: collection(projectSchema),
    lenient: collection(projectDraftSchema),
    issues: [
      ['data.0.typology', 'must have a Typology'],
      ['data.0.services', 'at least one Service'],
    ],
  },
  'project-cover-without-alt': {
    strict: collection(projectSchema),
    lenient: collection(projectDraftSchema),
    issues: [['data.0.cover.alternativeText', 'Alternative text is required']],
  },
  'project-credit-unpublished-member': {
    strict: collection(projectSchema),
    lenient: collection(projectDraftSchema),
    issues: [['data.0.credits.0.teamMember', 'must name a Team Member']],
  },
  'article-without-relations': {
    strict: collection(articleSchema),
    lenient: collection(articleDraftSchema),
    issues: [
      ['data.0.topic', 'must have a Topic'],
      ['data.0.byline', 'at least one Team Member'],
    ],
  },
  'page-reserved-slug': {
    strict: collection(pageSchema),
    lenient: collection(pageDraftSchema),
    issues: [['data.0.slug', 'reserved for a route']],
  },
  'home-page-violations': {
    strict: single(sectionsPageSchema),
    lenient: single(sectionsPageDraftSchema),
    issues: [
      ['data.sections.0.imageAlt', 'Alt text is required when an image is set'],
      ['data.sections.1.projects', 'between three and six'],
    ],
  },
  'studio-page-violations': {
    strict: single(sectionsPageSchema),
    lenient: single(sectionsPageDraftSchema),
    issues: [['data.sections.0.imageAlt', 'Alt text is required when an image is set']],
  },
};

// Recorded responses that look wrong but pass: the strict schema cannot see what Strapi removed.
export const silentDrops: Record<string, Published> = {
  'article-unpublished-byline': { strict: collection(articleSchema), lenient: collection(articleDraftSchema) },
};
