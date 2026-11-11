import 'server-only';
import type { API } from '@strapi/client';
import { cacheLife, cacheTag } from 'next/cache';
import { z } from 'zod';
import { pathOf, RESOURCES, uidOfSluggedType } from '../catalog';
import { readClient } from '../client';
import { slugHistorySchema } from '../schemas';
import { requiredText } from '../schemas/shared';
import { documentTag, slugHistoryTag, slugPathTag, typeTag } from '../tags';
import { readCollection } from './shared';

const targetSchema = z
  .object({ documentId: requiredText, slug: requiredText })
  .transform((value) => ({ id: value.documentId, slug: value.slug }));

const historyQuery = (oldPath: string): API.BaseQueryParams => ({
  filters: { oldPath: { $eq: oldPath } },
  pagination: { pageSize: 1 },
});

const targetQuery = (documentId: string): API.BaseQueryParams => ({
  filters: { documentId: { $eq: documentId } },
  fields: ['slug'],
  pagination: { pageSize: 1 },
});

// Callers pass a pathname, but a layer above may include a query or a trailing slash. The CMS stores
// the canonical path, so both are removed before the lookup.
const canonicalPath = (path: string): string => {
  const pathname = path.split(/[?#]/, 1)[0] ?? path;
  return pathname.replace(/\/+$/, '') || '/';
};

// The lookup is cached under the history tag, so a new redirect takes effect as soon as it is recorded.
// A target that is missing or unpublished returns null, which is a 404, and that null is tagged with
// the target too, so republishing the target clears it.
export async function getSlugRedirect(path: string): Promise<string | null> {
  'use cache';
  cacheLife('max');

  const oldPath = canonicalPath(path);
  cacheTag(slugHistoryTag);
  cacheTag(slugPathTag(oldPath));

  const historyResponse = await readClient().collection(RESOURCES.slugHistory).find(historyQuery(oldPath));
  const historyPage = readCollection('Slug history', slugHistorySchema, historyResponse);
  const history = historyPage.items[0];
  if (!history) return null;

  const uid = uidOfSluggedType(history.targetType);
  cacheTag(typeTag(uid));
  cacheTag(documentTag(uid, history.targetId));

  const targetResponse = await readClient().collection(RESOURCES[history.targetType]).find(targetQuery(history.targetId));
  const targetPage = readCollection('Slug target', targetSchema, targetResponse);
  const target = targetPage.items[0];
  return target ? pathOf(history.targetType, target.slug) : null;
}
