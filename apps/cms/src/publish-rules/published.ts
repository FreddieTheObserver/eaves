import type { Core } from '@strapi/strapi';

export type Doc = Record<string, unknown>;
export type Locale = string | string[] | undefined;

const PAGE_SIZE = 25;

export const named = (doc: Doc) => `"${String(doc.title ?? doc.name ?? doc.documentId)}"`;
export const list = (value: unknown) => (Array.isArray(value) ? (value as Doc[]) : []);
export const documentIds = (value: unknown) => list(value).map((item) => item.documentId as string);

// A page of results is not all of them, so a "last person" check would miss a holder past the first page.
export const publishedWhere = async (strapi: Core.Strapi, uid: string, query: Doc): Promise<Doc[]> => {
  const found: Doc[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const page = (await strapi.documents(uid as never).findMany({ ...query, status: 'published', sort: 'id:asc', start, limit: PAGE_SIZE } as never)) as Doc[];
    found.push(...page);
    if (page.length < PAGE_SIZE) return found;
  }
};

// Strapi leaves a document with no published version out of a published relation, so a rule that needs a
// relation counts only the related documents that are published.
export const publishedIds = async (strapi: Core.Strapi, uid: string, ids: string[], locale: Locale): Promise<Set<string>> => {
  if (ids.length === 0) return new Set();
  const found = await publishedWhere(strapi, uid, { locale, filters: { documentId: { $in: [...new Set(ids)] } } });
  return new Set(found.map((doc) => doc.documentId as string));
};
