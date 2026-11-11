import 'server-only';
import type { API } from '@strapi/client';
import { cacheLife, cacheTag } from 'next/cache';
import { RESOURCES, UIDS } from '../catalog';
import { draftClient, readClient } from '../client';
import populate from '../populate.json';
import { pageDraftSchema, pageSchema } from '../schemas';
import { pageCacheTags, typeTag } from '../tags';
import type { Page, PageDraft } from '../types';
import { DEFAULT_LOCALE, readBySlug, tagDropped } from './shared';

const slugQuery = (slug: string, locale: string): API.BaseQueryParams => ({
  locale,
  filters: { slug: { $eq: slug } },
  populate: populate.page,
});

export async function getPublishedPage(slug: string, locale = DEFAULT_LOCALE): Promise<Page | null> {
  'use cache';
  cacheLife('max');
  cacheTag(typeTag(UIDS.page));

  const response = await readClient().collection(RESOURCES.page).find(slugQuery(slug, locale));
  const page = readBySlug('Page', pageSchema, response, tagDropped);
  if (page) cacheTag(...pageCacheTags(page));
  return page;
}

export async function getDraftPage(slug: string, locale = DEFAULT_LOCALE): Promise<PageDraft | null> {
  const query: API.BaseQueryParams = { ...slugQuery(slug, locale), status: 'draft' };
  const response = await draftClient().collection(RESOURCES.page).find(query);
  return readBySlug('Page', pageDraftSchema, response);
}
