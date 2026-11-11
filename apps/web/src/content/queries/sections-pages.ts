import 'server-only';
import type { API } from '@strapi/client';
import { cacheLife, cacheTag } from 'next/cache';
import { UIDS } from '../catalog';
import { draftClient, readClient } from '../client';
import populate from '../populate.json';
import { sectionsPageDraftSchema, sectionsPageSchema } from '../schemas';
import { sectionsPageCacheTags, typeTag } from '../tags';
import type { HomePage, SectionsPage, SectionsPageDraft, StudioPage } from '../types';
import { DEFAULT_LOCALE, readSingle } from './shared';

type SectionsResource = 'home-page' | 'studio-page';
type SectionsUid = typeof UIDS.homePage | typeof UIDS.studioPage;

const query = (locale: string): API.BaseQueryParams => ({
  locale,
  populate: populate.sectionsPage,
});

async function publishedSectionsPage(
  resource: SectionsResource,
  uid: SectionsUid,
  locale: string
): Promise<SectionsPage> {
  'use cache';
  cacheLife('max');
  cacheTag(typeTag(uid));

  const response = await readClient().single(resource).find(query(locale));
  const page = readSingle('Sections page', sectionsPageSchema, response);
  cacheTag(...sectionsPageCacheTags(uid, page));
  return page;
}

async function draftSectionsPage(resource: SectionsResource, locale: string): Promise<SectionsPageDraft> {
  const draft: API.BaseQueryParams = { ...query(locale), status: 'draft' };
  const response = await draftClient().single(resource).find(draft);
  return readSingle('Sections page', sectionsPageDraftSchema, response);
}

export const getPublishedHomePage = (locale = DEFAULT_LOCALE): Promise<HomePage> =>
  publishedSectionsPage('home-page', UIDS.homePage, locale);

export const getPublishedStudioPage = (locale = DEFAULT_LOCALE): Promise<StudioPage> =>
  publishedSectionsPage('studio-page', UIDS.studioPage, locale);

export const getDraftHomePage = (locale = DEFAULT_LOCALE): Promise<SectionsPageDraft> =>
  draftSectionsPage('home-page', locale);

export const getDraftStudioPage = (locale = DEFAULT_LOCALE): Promise<SectionsPageDraft> =>
  draftSectionsPage('studio-page', locale);
