import { z } from 'zod';
import type { Draft, Service } from '../types';
import { bodySchema, draftBodySchema } from './blocks';
import { coverImage, draftCover, draftSeo, list, maybe, maybeText, requiredText, seo } from './shared';

const listItem = z.object({ text: requiredText }).transform((item) => item.text);
const draftListItem = z.object({ text: maybeText });

export const serviceSchema = z
  .object({
    documentId: requiredText,
    locale: requiredText,
    slug: requiredText,
    name: requiredText,
    summary: requiredText,
    cover: coverImage,
    spaces: z.array(listItem).min(1, 'A Service needs at least one Space'),
    scope: z.array(listItem).min(1, 'A Service needs at least one Scope item'),
    order: z.number().int(),
    body: bodySchema,
    seo,
  })
  .transform(
    (value): Service => ({
      id: value.documentId,
      locale: value.locale,
      slug: value.slug,
      name: value.name,
      summary: value.summary,
      cover: value.cover,
      spaces: value.spaces,
      scope: value.scope,
      order: value.order,
      body: value.body,
      seo: value.seo,
    })
  );

const texts = (items: { text?: string }[]) => items.flatMap((item) => (item.text ? [item.text] : []));

export const serviceDraftSchema = z
  .object({
    documentId: requiredText,
    locale: requiredText,
    slug: maybeText,
    name: maybeText,
    summary: maybeText,
    cover: draftCover,
    spaces: list(draftListItem),
    scope: list(draftListItem),
    order: maybe(z.number().int()),
    body: draftBodySchema,
    seo: draftSeo,
  })
  .transform(
    (value): Draft<Service> => ({
      id: value.documentId,
      locale: value.locale,
      slug: value.slug,
      name: value.name,
      summary: value.summary,
      cover: value.cover,
      spaces: texts(value.spaces),
      scope: texts(value.scope),
      order: value.order,
      body: value.body,
      seo: value.seo,
    })
  );
