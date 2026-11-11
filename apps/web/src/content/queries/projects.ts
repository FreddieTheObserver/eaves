import 'server-only';
import type { API } from '@strapi/client';
import { cacheLife, cacheTag } from 'next/cache';
import { RESOURCES, UIDS } from '../catalog';
import { draftClient, readClient } from '../client';
import populate from '../populate.json';
import { projectCardDraftSchema, projectCardSchema, projectDraftSchema, projectSchema } from '../schemas';
import { listCacheTags, projectCacheTags, projectCardCacheTags, typeTag } from '../tags';
import type { Collection, Project, ProjectCard, ProjectCardDraft, ProjectDraft } from '../types';
import { DEFAULT_LOCALE, readBySlug, readEvery, tagDropped } from './shared';

export type ProjectFilters = { typology?: string; service?: string };

const filtersOf = ({ typology, service }: ProjectFilters): Record<string, unknown> => ({
  ...(typology ? { typology: { slug: { $eq: typology } } } : {}),
  ...(service ? { services: { slug: { $eq: service } } } : {}),
});

const listQuery = (filters: ProjectFilters, locale: string): API.BaseQueryParams => ({
  locale,
  sort: ['year:desc', 'title:asc'],
  populate: populate.projectCard,
  filters: filtersOf(filters),
});

const slugQuery = (slug: string, locale: string): API.BaseQueryParams => ({
  locale,
  filters: { slug: { $eq: slug } },
  populate: populate.project,
});

export async function getPublishedProjects(
  filters: ProjectFilters = {},
  locale = DEFAULT_LOCALE
): Promise<Collection<ProjectCard>> {
  'use cache';
  cacheLife('max');

  const page = await readEvery(
    'Project',
    projectCardSchema,
    (pagination) => readClient().collection(RESOURCES.project).find({ ...listQuery(filters, locale), pagination }),
    tagDropped
  );
  cacheTag(...listCacheTags(UIDS.project, page.items, projectCardCacheTags));
  return page;
}

export async function getDraftProjects(
  filters: ProjectFilters = {},
  locale = DEFAULT_LOCALE
): Promise<Collection<ProjectCardDraft>> {
  return readEvery('Project', projectCardDraftSchema, (pagination) =>
    draftClient()
      .collection(RESOURCES.project)
      .find({ ...listQuery(filters, locale), status: 'draft', pagination })
  );
}

export async function getPublishedProject(slug: string, locale = DEFAULT_LOCALE): Promise<Project | null> {
  'use cache';
  cacheLife('max');
  cacheTag(typeTag(UIDS.project));

  const response = await readClient().collection(RESOURCES.project).find(slugQuery(slug, locale));
  const project = readBySlug('Project', projectSchema, response, tagDropped);
  if (project) cacheTag(...projectCacheTags(project));
  return project;
}

export async function getDraftProject(slug: string, locale = DEFAULT_LOCALE): Promise<ProjectDraft | null> {
  const query: API.BaseQueryParams = { ...slugQuery(slug, locale), status: 'draft' };
  const response = await draftClient().collection(RESOURCES.project).find(query);
  return readBySlug('Project', projectDraftSchema, response);
}
