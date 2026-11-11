import 'server-only';
import { UIDS } from './catalog';
import type { Dropped } from './schemas';
import type {
  Article,
  ArticleCard,
  Block,
  Page,
  Project,
  ProjectCard,
  Section,
  SectionsPage,
  Service,
  SiteSettings,
  TeamMember,
  Topic,
  Typology,
} from './types';

export const typeTag = (uid: string): string => `content:${uid}`;
export const documentTag = (uid: string, id: string): string => `content:${uid}:${id}`;

export const slugHistoryTag = 'content:slug-history';

// A Quote names a Team Member, so a body shows that person's name and position.
const bodyCacheTags = (body: readonly Block[]): string[] =>
  body.flatMap((block) => (block.type === 'quote' && block.speaker ? [documentTag(UIDS.teamMember, block.speaker.id)] : []));

// A card that was dropped is not in the data any more, so only the drop still names its document. Tagging it
// means that fixing or republishing that document clears the page that lost it.
const DROPPED_DOCUMENTS: Record<string, string> = {
  'Related Project': UIDS.project,
  'Project card': UIDS.project,
};

export const droppedCacheTags = (dropped: readonly Dropped[]): string[] =>
  dropped.flatMap((drop) => {
    const place = drop.path.at(-1);
    const uid = place ? DROPPED_DOCUMENTS[place.what] : undefined;
    return [...(uid && place?.id ? [documentTag(uid, place.id)] : []), ...droppedCacheTags(drop.causes)];
  });

export const projectCardCacheTags = (card: ProjectCard): string[] => [
  documentTag(UIDS.project, card.id),
  documentTag(UIDS.typology, card.typology.id),
];

export const projectCacheTags = (project: Project): string[] => [
  ...projectCardCacheTags(project),
  ...project.services.map((service) => documentTag(UIDS.service, service.id)),
  ...project.credits.map((credit) => documentTag(UIDS.teamMember, credit.teamMember.id)),
  ...bodyCacheTags(project.body),
];

export const articleCardCacheTags = (card: ArticleCard): string[] => [
  documentTag(UIDS.article, card.id),
  documentTag(UIDS.topic, card.topic.id),
];

export const articleCacheTags = (article: Article): string[] => [
  ...articleCardCacheTags(article),
  ...article.byline.map((member) => documentTag(UIDS.teamMember, member.id)),
  ...article.relatedProjects.flatMap(projectCardCacheTags),
  ...bodyCacheTags(article.body),
];

const sectionCacheTags = (section: Section): string[] =>
  section.type === 'selectedProjects' ? section.projects.flatMap(projectCardCacheTags) : [];

export const pageCacheTags = (page: Page): string[] => [documentTag(UIDS.page, page.id), ...bodyCacheTags(page.body)];

export const sectionsPageCacheTags = (
  uid: typeof UIDS.homePage | typeof UIDS.studioPage,
  page: SectionsPage
): string[] => [documentTag(uid, page.id), ...page.sections.flatMap(sectionCacheTags)];

export const serviceCacheTags = (service: Service): string[] => [documentTag(UIDS.service, service.id), ...bodyCacheTags(service.body)];

export const teamMemberCacheTags = (member: TeamMember): string[] => [documentTag(UIDS.teamMember, member.id)];

export const typologyCacheTags = (typology: Typology): string[] => [documentTag(UIDS.typology, typology.id)];

export const topicCacheTags = (topic: Topic): string[] => [documentTag(UIDS.topic, topic.id)];

export const siteSettingsCacheTags = (settings: SiteSettings): string[] => [documentTag(UIDS.siteSettings, settings.id)];

export const listCacheTags = <T>(uid: string, items: readonly T[], tagsOf: (item: T) => string[]): string[] => [
  typeTag(uid),
  ...items.flatMap(tagsOf),
];
