import 'server-only';
import { cacheTag } from 'next/cache';
import type { z } from 'zod';
import { reportDropped } from '../report';
import { collection, parseContent, single, type Dropped } from '../schemas';
import { droppedCacheTags } from '../tags';
import type { Collection } from '../types';

export const DEFAULT_LOCALE = 'en';

// Strapi's maxLimit. A list that shows every document reads every page of it, so none stops at the default of 25.
const EVERY_PAGE_SIZE = 100;

type OnDropped = (dropped: Dropped[]) => void;

// Called by the published queries, inside their cache scope, so a document that was dropped still clears the page.
export const tagDropped: OnDropped = (dropped) => {
  const tags = droppedCacheTags(dropped);
  if (tags.length > 0) cacheTag(...tags);
};

const problemText = (where: string, problems: string[]): string =>
  `${where} could not be read: ${problems.join('; ')}`;

// A contract failure is a wrong query or a wrong deployment, not an Editor's mistake, so it throws and
// fails the page loudly. A dropped item is content the CMS accepted, so it is logged and the rest is kept.
export const readCollection = <T>(
  where: string,
  item: z.ZodType<T>,
  response: unknown,
  onDropped?: OnDropped
): Collection<T> => {
  const result = parseContent(collection(item, where), response);
  reportDropped(where, result.dropped);
  onDropped?.(result.dropped);
  if (!result.ok) throw new Error(problemText(where, result.problems));
  return result.value;
};

export const readEvery = async <T>(
  where: string,
  item: z.ZodType<T>,
  fetchPage: (pagination: { page: number; pageSize: number }) => Promise<unknown>,
  onDropped?: OnDropped
): Promise<Collection<T>> => {
  const read = async (page: number) =>
    readCollection(where, item, await fetchPage({ page, pageSize: EVERY_PAGE_SIZE }), onDropped);

  const first = await read(1);
  const items = [...first.items];
  for (let page = 2; page <= first.pagination.pageCount; page += 1) items.push(...(await read(page)).items);
  return { items, pagination: { ...first.pagination, page: 1, pageCount: 1 } };
};

export const readSingle = <T>(where: string, item: z.ZodType<T>, response: unknown, onDropped?: OnDropped): T => {
  const result = parseContent(single(item), response);
  reportDropped(where, result.dropped);
  onDropped?.(result.dropped);
  if (!result.ok) throw new Error(problemText(where, result.problems));
  return result.value;
};

// A slug is unique in Strapi, so more than one document means the query or the schema is wrong.
// No document means a 404. A dropped document also means a 404, but the drop has already been logged.
export const readBySlug = <T>(where: string, item: z.ZodType<T>, response: unknown, onDropped?: OnDropped): T | null => {
  const result = parseContent(collection(item, where), response);
  reportDropped(where, result.dropped);
  onDropped?.(result.dropped);
  if (!result.ok) throw new Error(problemText(where, result.problems));

  const [first, ...rest] = result.value.items;
  if (rest.length) throw new Error(`${where} returned ${result.value.items.length} documents for one slug`);
  return first ?? null;
};
