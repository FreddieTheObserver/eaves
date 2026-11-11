import type { Core, UID } from '@strapi/strapi';
import { SLUG_HISTORY } from './access/constants';
import { pathOf, sluggedTypeOf, type SluggedType } from './paths';

type Params = { documentId: string; locale?: string };
type Row = { documentId: string };

const publishedSlug = async (strapi: Core.Strapi, uid: UID.ContentType, { documentId, locale }: Params) => {
  const document = await strapi.documents(uid).findOne({ documentId, locale, status: 'published', fields: ['slug'] } as never);
  return (document as { slug?: string } | null)?.slug ?? null;
};

const rowAt = async (strapi: Core.Strapi, oldPath: string) =>
  (await strapi.documents(SLUG_HISTORY).findFirst({ filters: { oldPath } } as never)) as Row | null;

const pointAt = async (strapi: Core.Strapi, type: SluggedType, documentId: string, oldPath: string) => {
  const history = strapi.documents(SLUG_HISTORY);
  const data = { oldPath, targetType: type, targetDocumentId: documentId };
  const existing = await rowAt(strapi, oldPath);
  if (existing) await history.update({ documentId: existing.documentId, data } as never);
  else await history.create({ data } as never);
};

const recordMove = async (strapi: Core.Strapi, type: SluggedType, documentId: string, before: string | null, after: string) => {
  // The new path is live now, so a record left by an earlier move must not send it elsewhere.
  const reclaimed = await rowAt(strapi, pathOf(type, after));
  if (reclaimed) await strapi.documents(SLUG_HISTORY).delete({ documentId: reclaimed.documentId } as never);
  if (before) await pointAt(strapi, type, documentId, pathOf(type, before));
};

const forgetDocument = async (strapi: Core.Strapi, documentId: string) => {
  const history = strapi.documents(SLUG_HISTORY);
  const rows = (await history.findMany({ filters: { targetDocumentId: documentId } } as never)) as Row[];
  for (const row of rows) await history.delete({ documentId: row.documentId } as never);
};

// A Document Service middleware rather than a lifecycle hook: Strapi publishes by deleting the published row and
// creating a new one, so a hook on the published row never sees the slug change.
export const registerSlugHistory = (strapi: Core.Strapi) => {
  strapi.documents.use(async (context, next) => {
    const { action, uid } = context;
    const type = sluggedTypeOf(uid);
    if (!type || (action !== 'publish' && action !== 'unpublish' && action !== 'delete')) return next();

    const params = context.params as Params;

    // One transaction, so a publish that cannot record its redirect is undone rather than breaking the old link.
    return strapi.db.transaction(async () => {
      if (action === 'delete') {
        const result = await next();
        await forgetDocument(strapi, params.documentId);
        return result;
      }

      // The path was live until now. The web app answers 404 for it while the document is unpublished, and a
      // redirect once the document is back under another slug. Publishing at the same slug again reclaims it.
      if (action === 'unpublish') {
        const leaving = await publishedSlug(strapi, uid, params);
        const result = await next();
        if (leaving) await pointAt(strapi, type, params.documentId, pathOf(type, leaving));
        return result;
      }

      const before = await publishedSlug(strapi, uid, params);
      const result = await next();
      const after = await publishedSlug(strapi, uid, params);
      if (after && after !== before) await recordMove(strapi, type, params.documentId, before, after);
      return result;
    });
  });
};
