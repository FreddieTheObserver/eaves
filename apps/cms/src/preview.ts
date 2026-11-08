import type { Core, UID } from '@strapi/strapi';
import { pathOf, sluggedTypeOf } from './paths';

// These have no slug of their own, so they preview on the page that shows them.
const FIXED_PATHS: Record<string, string> = {
  'api::home-page.home-page': '/',
  'api::studio-page.studio-page': '/studio',
  'api::team-member.team-member': '/studio',
  'api::site-settings.site-settings': '/',
};

type PreviewParams = { documentId: string; locale?: string; status?: string };

export const previewPath = async (strapi: Core.Strapi, uid: string, { documentId, locale, status }: PreviewParams) => {
  const fixed = FIXED_PATHS[uid];
  if (fixed) return fixed;

  const type = sluggedTypeOf(uid);
  if (!type) return null;

  const document = await strapi.documents(uid as UID.ContentType).findOne({ documentId, locale, status } as never);
  const slug = (document as { slug?: unknown } | null)?.slug;
  return typeof slug === 'string' && slug !== '' ? pathOf(type, slug) : null;
};
