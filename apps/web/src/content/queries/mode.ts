import 'server-only';
import { draftMode } from 'next/headers';
import type { Collection, ProjectCardDraft, ProjectDraft, ServiceDraft, TeamMemberDraft } from '../types';
import { getDraftProject, getDraftProjects, getPublishedProject, getPublishedProjects, type ProjectFilters } from './projects';
import { getDraftService, getDraftServices, getPublishedService, getPublishedServices } from './services';
import { getDraftTeamMembers, getPublishedTeamMembers } from './team-members';
import { DEFAULT_LOCALE } from './shared';

export { getTopics, getTypologies } from './references';

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

export async function getServices(locale = DEFAULT_LOCALE): Promise<Collection<ServiceDraft>> {
  return (await draftMode()).isEnabled ? getDraftServices(locale) : getPublishedServices(locale);
}

export async function getService(slug: string, locale = DEFAULT_LOCALE): Promise<ServiceDraft | null> {
  return (await draftMode()).isEnabled ? getDraftService(slug, locale) : getPublishedService(slug, locale);
}

export async function getTeamMembers(locale = DEFAULT_LOCALE): Promise<Collection<TeamMemberDraft>> {
  return (await draftMode()).isEnabled ? getDraftTeamMembers(locale) : getPublishedTeamMembers(locale);
}
