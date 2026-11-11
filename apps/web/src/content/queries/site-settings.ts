import 'server-only';
import type { API } from '@strapi/client';
import { cacheLife, cacheTag } from 'next/cache';
import { RESOURCES, UIDS } from '../catalog';
import { draftClient, readClient } from '../client';
import populate from '../populate.json';
import { siteSettingsDraftSchema, siteSettingsSchema } from '../schemas';
import { siteSettingsCacheTags, typeTag } from '../tags';
import type { SiteSettings, SiteSettingsDraft } from '../types';
import { DEFAULT_LOCALE, readSingle } from './shared';

const query = (locale: string): API.BaseQueryParams => ({
  locale,
  populate: populate.siteSettings,
});

export async function getPublishedSiteSettings(locale = DEFAULT_LOCALE): Promise<SiteSettings> {
  'use cache';
  cacheLife('max');
  cacheTag(typeTag(UIDS.siteSettings));

  const response = await readClient().single(RESOURCES.siteSettings).find(query(locale));
  const settings = readSingle('Site Settings', siteSettingsSchema, response);
  cacheTag(...siteSettingsCacheTags(settings));
  return settings;
}

export async function getDraftSiteSettings(locale = DEFAULT_LOCALE): Promise<SiteSettingsDraft> {
  const draft: API.BaseQueryParams = { ...query(locale), status: 'draft' };
  const response = await draftClient().single(RESOURCES.siteSettings).find(draft);
  return readSingle('Site Settings', siteSettingsDraftSchema, response);
}
