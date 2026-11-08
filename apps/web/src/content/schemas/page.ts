import { z } from 'zod';
import type { Draft, Page } from '../types';
import { bodySchema, draftBodySchema } from './blocks';
import { RESERVED_PAGE_SLUGS, draftSeo, maybeText, requiredText, seo } from './shared';

export const pageSchema = z
  .object({
    documentId: requiredText,
    locale: requiredText,
    slug: requiredText.refine((slug) => !RESERVED_PAGE_SLUGS.includes(slug.toLowerCase()), {
      error: (issue) => `The slug "${String(issue.input)}" is reserved for a route (${RESERVED_PAGE_SLUGS.join(', ')})`,
    }),
    title: requiredText,
    body: bodySchema,
    seo,
  })
  .transform(
    (value): Page => ({
      id: value.documentId,
      locale: value.locale,
      slug: value.slug,
      title: value.title,
      body: value.body,
      seo: value.seo,
    })
  );

export const pageDraftSchema = z
  .object({
    documentId: requiredText,
    locale: requiredText,
    slug: maybeText,
    title: maybeText,
    body: draftBodySchema,
    seo: draftSeo,
  })
  .transform(
    (value): Draft<Page> => ({
      id: value.documentId,
      locale: value.locale,
      slug: value.slug,
      title: value.title,
      body: value.body,
      seo: value.seo,
    })
  );
