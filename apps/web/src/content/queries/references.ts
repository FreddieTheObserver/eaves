import 'server-only';
import type { API } from '@strapi/client';
import { cacheLife, cacheTag } from 'next/cache';
import { RESOURCES, UIDS } from '../catalog';
import { readClient } from '../client';
import { topicSchema, typologySchema } from '../schemas';
import { listCacheTags, topicCacheTags, typologyCacheTags } from '../tags';
import type { Collection, Topic, Typology } from '../types';
import { DEFAULT_LOCALE, readEvery } from './shared';

const listQuery = (locale: string): API.BaseQueryParams => ({ locale, sort: 'name:asc' });

// Typology and Topic have no Draft and Publish, so there is one list each and no draft variant.
export async function getTypologies(locale = DEFAULT_LOCALE): Promise<Collection<Typology>> {
  'use cache';
  cacheLife('max');

  const page = await readEvery('Typology', typologySchema, (pagination) =>
    readClient().collection(RESOURCES.typology).find({ ...listQuery(locale), pagination })
  );
  cacheTag(...listCacheTags(UIDS.typology, page.items, typologyCacheTags));
  return page;
}

export async function getTopics(locale = DEFAULT_LOCALE): Promise<Collection<Topic>> {
  'use cache';
  cacheLife('max');

  const page = await readEvery('Topic', topicSchema, (pagination) =>
    readClient().collection(RESOURCES.topic).find({ ...listQuery(locale), pagination })
  );
  cacheTag(...listCacheTags(UIDS.topic, page.items, topicCacheTags));
  return page;
}
