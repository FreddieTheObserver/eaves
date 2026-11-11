import rules from './rules.json';
import type { SlugTargetType } from './types';

// Strapi names the same thing three ways: a UID for permissions and webhooks, a REST resource for
// the client, and a route for the browser. Keeping them together stops one from drifting.
export const UIDS = {
  project: 'api::project.project',
  service: 'api::service.service',
  teamMember: 'api::team-member.team-member',
  article: 'api::article.article',
  page: 'api::page.page',
  homePage: 'api::home-page.home-page',
  studioPage: 'api::studio-page.studio-page',
  siteSettings: 'api::site-settings.site-settings',
  typology: 'api::typology.typology',
  topic: 'api::topic.topic',
  slugHistory: 'api::slug-history.slug-history',
  inquiry: 'api::inquiry.inquiry',
} as const;

export type ContentKind = keyof typeof UIDS;

export const RESOURCES = {
  project: 'projects',
  service: 'services',
  teamMember: 'team-members',
  article: 'articles',
  page: 'pages',
  homePage: 'home-page',
  studioPage: 'studio-page',
  siteSettings: 'site-settings',
  typology: 'typologies',
  topic: 'topics',
  slugHistory: 'slug-histories',
  inquiry: 'inquiries',
} as const satisfies Record<ContentKind, string>;

const KIND_BY_UID = Object.fromEntries(
  Object.entries(UIDS).map(([kind, uid]) => [uid, kind as ContentKind])
) as Record<string, ContentKind>;

export const kindOfUid = (uid: string): ContentKind | undefined => KIND_BY_UID[uid];

export const sluggedTypeOfUid = (uid: string): SlugTargetType | null => {
  const kind = KIND_BY_UID[uid];
  return kind === 'project' || kind === 'service' || kind === 'article' || kind === 'page' ? kind : null;
}

export const pathOf = (type: SlugTargetType, slug: string): string => `${rules.routes[type]}${slug}`;

const UID_BY_SLUGGED_TYPE = {
  project: UIDS.project,
  service: UIDS.service,
  article: UIDS.article,
  page: UIDS.page,
} as const satisfies Record<SlugTargetType, string>;

export const uidOfSluggedType = (type: SlugTargetType): string => UID_BY_SLUGGED_TYPE[type];

// Media changes can alter alt text on any document, so the revalidation
// route clears every content type.
export const CACHED_UIDS = [
  UIDS.project,
  UIDS.service,
  UIDS.teamMember,
  UIDS.article,
  UIDS.page,
  UIDS.homePage,
  UIDS.studioPage,
  UIDS.siteSettings,
  UIDS.typology,
  UIDS.topic,
] as const;
