import 'server-only';
import type { z } from 'zod';
import { reportDropped } from '../report';
import { collection, parseContent, single } from '../schemas';
import type { Collection } from '../types';

export const DEFAULT_LOCALE = 'en';

const problemText = (where: string, problems: string[]): string =>
  `${where} could not be read: ${problems.join('; ')}`;

// A contract failure is a wrong query or a wrong deployment, not an Editor's mistake, so it throws and
// fails the page loudly. A dropped item is content the CMS accepted, so it is logged and the rest is kept.
export const readCollection = <T>(where: string, item: z.ZodType<T>, response: unknown): Collection<T> => {
  const result = parseContent(collection(item, where), response);
  reportDropped(where, result.dropped);
  if (!result.ok) throw new Error(problemText(where, result.problems));
  return result.value;
};

export const readSingle = <T>(where: string, item: z.ZodType<T>, response: unknown): T => {
  const result = parseContent(single(item), response);
  reportDropped(where, result.dropped);
  if (!result.ok) throw new Error(problemText(where, result.problems));
  return result.value;
};

// A slug is unique in Strapi, so more than one document means the query or the schema is wrong.
// No document means a 404. A dropped document also means a 404, but the drop has already been logged.
export const readBySlug = <T>(where: string, item: z.ZodType<T>, response: unknown): T | null => {
  const result = parseContent(collection(item, where), response);
  reportDropped(where, result.dropped);
  if (!result.ok) throw new Error(problemText(where, result.problems));

  const [first, ...rest] = result.value.items;
  if (rest.length) throw new Error(`${where} returned ${result.value.items.length} documents for one slug`);
  return first ?? null;
};
