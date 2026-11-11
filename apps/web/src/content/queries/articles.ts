import 'server-only';
import type { API } from '@strapi/client';
import { cacheLife, cacheTag } from 'next/cache';
import { RESOURCES, UIDS } from '../catalog';
import { draftClient, readClient } from '../client';
import populate from '../populate.json';
import { articleCardDraftSchema, articleCardSchema, articleDraftSchema, articleSchema } from '../schemas';
import { articleCacheTags, articleCardCacheTags, listCacheTags, typeTag } from '../tags';
import type { Article, ArticleCard, ArticleCardDraft, ArticleDraft, Collection } from '../types';
import { DEFAULT_LOCALE, readBySlug, readCollection } from './shared';

export type ArticleFilters = { page?: number; topic?: string; pageSize?: number };

const filtersOf = ({ topic }: ArticleFilters): Record<string, unknown> =>
  topic ? { topic: { slug: { $eq: topic } } } : {};

const listQuery = (filters: ArticleFilters, locale: string): API.BaseQueryParams => ({
  locale,
  sort: 'publicationDate:desc',
  pagination: { page: filters.page ?? 1, pageSize: filters.pageSize ?? 12 },
  populate: populate.articleCard,
  filters: filtersOf(filters),
});

const slugQuery = (slug: string, locale: string): API.BaseQueryParams => ({
  locale,
  filters: { slug: { $eq: slug } },
  populate: populate.article,
});

export async function getPublishedArticles(
  filters: ArticleFilters = {},
  locale = DEFAULT_LOCALE
): Promise<Collection<ArticleCard>> {
  'use cache';
  cacheLife('max');

  const response = await readClient().collection(RESOURCES.article).find(listQuery(filters, locale));
  const page = readCollection('Article', articleCardSchema, response);
  cacheTag(...listCacheTags(UIDS.article, page.items, articleCardCacheTags));
  return page;
}

export async function getDraftArticles(
  filters: ArticleFilters = {},
  locale = DEFAULT_LOCALE
): Promise<Collection<ArticleCardDraft>> {
  const query: API.BaseQueryParams = { ...listQuery(filters, locale), status: 'draft' };
  const response = await draftClient().collection(RESOURCES.article).find(query);
  return readCollection('Article', articleCardDraftSchema, response);
}

export async function getPublishedArticle(slug: string, locale = DEFAULT_LOCALE): Promise<Article | null> {
  'use cache';
  cacheLife('max');
  cacheTag(typeTag(UIDS.article));

  const response = await readClient().collection(RESOURCES.article).find(slugQuery(slug, locale));
  const article = readBySlug('Article', articleSchema, response);
  if (article) cacheTag(...articleCacheTags(article));
  return article;
}

export async function getDraftArticle(slug: string, locale = DEFAULT_LOCALE): Promise<ArticleDraft | null> {
  const query: API.BaseQueryParams = { ...slugQuery(slug, locale), status: 'draft' };
  const response = await draftClient().collection(RESOURCES.article).find(query);
  return readBySlug('Article', articleDraftSchema, response);
}
