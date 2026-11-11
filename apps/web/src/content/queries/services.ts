import 'server-only';
import type { API } from '@strapi/client';
import { cacheLife, cacheTag } from 'next/cache';
import { RESOURCES, UIDS } from '../catalog';
import { draftClient, readClient } from '../client';
import populate from '../populate.json';
import { serviceDraftSchema, serviceSchema } from '../schemas';
import { listCacheTags, serviceCacheTags, typeTag } from '../tags';
import type { Collection, Service, ServiceDraft } from '../types';
import { DEFAULT_LOCALE, readBySlug, readCollection } from './shared';

const listQuery = (locale: string): API.BaseQueryParams => ({
  locale,
  sort: 'order:asc',
  populate: populate.service,
});

const slugQuery = (slug: string, locale: string): API.BaseQueryParams => ({
  locale,
  filters: { slug: { $eq: slug } },
  populate: populate.service,
});

export async function getPublishedServices(locale = DEFAULT_LOCALE): Promise<Collection<Service>> {
  'use cache';
  cacheLife('max');

  const response = await readClient().collection(RESOURCES.service).find(listQuery(locale));
  const page = readCollection('Service', serviceSchema, response);
  cacheTag(...listCacheTags(UIDS.service, page.items, serviceCacheTags));
  return page;
}

export async function getDraftServices(locale = DEFAULT_LOCALE): Promise<Collection<ServiceDraft>> {
  const query: API.BaseQueryParams = { ...listQuery(locale), status: 'draft' };
  const response = await draftClient().collection(RESOURCES.service).find(query);
  return readCollection('Service', serviceDraftSchema, response);
}

export async function getPublishedService(slug: string, locale = DEFAULT_LOCALE): Promise<Service | null> {
  'use cache';
  cacheLife('max');
  cacheTag(typeTag(UIDS.service));

  const response = await readClient().collection(RESOURCES.service).find(slugQuery(slug, locale));
  const service = readBySlug('Service', serviceSchema, response);
  if (service) cacheTag(...serviceCacheTags(service));
  return service;
}

export async function getDraftService(slug: string, locale = DEFAULT_LOCALE): Promise<ServiceDraft | null> {
  const query: API.BaseQueryParams = { ...slugQuery(slug, locale), status: 'draft' };
  const response = await draftClient().collection(RESOURCES.service).find(query);
  return readBySlug('Service', serviceDraftSchema, response);
}
