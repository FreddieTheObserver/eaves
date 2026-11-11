import 'server-only';
import { draftMode } from 'next/headers';
import type {
  ArticleCardDraft,
  ArticleDraft,
  Collection,
  PageDraft,
  ProjectCardDraft,
  ProjectDraft,
  SectionsPageDraft,
  ServiceDraft,
  SiteSettingsDraft,
  TeamMemberDraft,
} from '../types';
import { getDraftArticle, getDraftArticles, getPublishedArticle, getPublishedArticles, type ArticleFilters } from './articles';
import { getDraftPage, getPublishedPage } from './pages';
import { getDraftProject, getDraftProjects, getPublishedProject, getPublishedProjects, type ProjectFilters } from './projects';
import {
  getDraftHomePage,
  getDraftStudioPage,
  getPublishedHomePage,
  getPublishedStudioPage,
} from './sections-pages';
import { getDraftService, getDraftServices, getPublishedService, getPublishedServices } from './services';
import { getDraftSiteSettings, getPublishedSiteSettings } from './site-settings';
import { getDraftTeamMembers, getPublishedTeamMembers } from './team-members';
import { DEFAULT_LOCALE } from './shared';

export { getTopics, getTypologies } from './references';
export { getSlugRedirect } from './slug-history';

// The published branch is cached; the draft branch is not. Reading draft mode here, outside the cached
// functions, is what lets one page template serve both without asking the cache for drafts.
export async function getProjects(
  filters: ProjectFilters = {},
  locale = DEFAULT_LOCALE
): Promise<Collection<ProjectCardDraft>> {
  return (await draftMode()).isEnabled
    ? getDraftProjects(filters, locale)
    : getPublishedProjects(filters, locale);
}

export async function getProject(slug: string, locale = DEFAULT_LOCALE): Promise<ProjectDraft | null> {
  return (await draftMode()).isEnabled ? getDraftProject(slug, locale) : getPublishedProject(slug, locale);
}

export async function getArticles(
  filters: ArticleFilters = {},
  locale = DEFAULT_LOCALE
): Promise<Collection<ArticleCardDraft>> {
  return (await draftMode()).isEnabled
    ? getDraftArticles(filters, locale)
    : getPublishedArticles(filters, locale);
}

export async function getArticle(slug: string, locale = DEFAULT_LOCALE): Promise<ArticleDraft | null> {
  return (await draftMode()).isEnabled ? getDraftArticle(slug, locale) : getPublishedArticle(slug, locale);
}

export async function getServices(locale = DEFAULT_LOCALE): Promise<Collection<ServiceDraft>> {
  return (await draftMode()).isEnabled ? getDraftServices(locale) : getPublishedServices(locale);
}

export async function getService(slug: string, locale = DEFAULT_LOCALE): Promise<ServiceDraft | null> {
  return (await draftMode()).isEnabled ? getDraftService(slug, locale) : getPublishedService(slug, locale);
}

export async function getTeamMembers(locale = DEFAULT_LOCALE): Promise<Collection<TeamMemberDraft>> {
  return (await draftMode()).isEnabled ? getDraftTeamMembers(locale) : getPublishedTeamMembers(locale);
}

export async function getPage(slug: string, locale = DEFAULT_LOCALE): Promise<PageDraft | null> {
  return (await draftMode()).isEnabled ? getDraftPage(slug, locale) : getPublishedPage(slug, locale);
}

export async function getHomePage(locale = DEFAULT_LOCALE): Promise<SectionsPageDraft> {
  return (await draftMode()).isEnabled ? getDraftHomePage(locale) : getPublishedHomePage(locale);
}

export async function getStudioPage(locale = DEFAULT_LOCALE): Promise<SectionsPageDraft> {
  return (await draftMode()).isEnabled ? getDraftStudioPage(locale) : getPublishedStudioPage(locale);
}

export async function getSiteSettings(locale = DEFAULT_LOCALE): Promise<SiteSettingsDraft> {
  return (await draftMode()).isEnabled ? getDraftSiteSettings(locale) : getPublishedSiteSettings(locale);
}
