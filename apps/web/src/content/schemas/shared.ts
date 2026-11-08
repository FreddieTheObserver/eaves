import { z } from 'zod';
import rules from '../rules.json';
import type { Collection, Draft, Figure, Image, Link, Seo, ShareImage } from '../types';
import { tolerantList } from './tolerance';

// A Page cannot use these slugs because /[slug] would shadow a route (section 10 of the design document).
export const RESERVED_PAGE_SLUGS: readonly string[] = rules.reservedPageSlugs;

// Strapi enforces the same pattern on Link.href. It is repeated here because an href that arrives around
// the admin panel, from a seed or a transfer, must still not become a javascript: URL.
const LINK_HREF = /^(\/(?!\/)|https:\/\/)\S*$/;

export const requiredText = z.string().trim().min(1);
export const maybe = <T extends z.ZodType>(schema: T) => schema.nullish().transform((value) => value ?? undefined).optional();
export const maybeText = z.string().nullish().transform((value) => value?.trim() || undefined).optional();
export const populated = <T extends z.ZodType>(schema: T) => schema.nullable().transform((value) => value ?? undefined);
export const list = <T extends z.ZodType>(item: T) => z.array(item).nullish().transform((value) => value ?? []);

export const mediaFile = z.object({
  url: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
const ALT_REQUIRED = 'Alternative text is required';
const mediaFileWithAlt = mediaFile.extend({ alternativeText: z.string({ error: ALT_REQUIRED }).trim().min(1, ALT_REQUIRED) });
const draftMediaFile = mediaFile.extend({ alternativeText: maybeText });

type MediaFile = z.output<typeof mediaFile>;
export const toImage = (file: MediaFile, alt: string): Image => ({ url: file.url, width: file.width, height: file.height, alt });
export const toDraftImage = (file: MediaFile, alt: string | undefined): Draft<Image> => ({
  url: file.url,
  width: file.width,
  height: file.height,
  alt,
});
const toShareImage = (file: MediaFile): ShareImage => ({ url: file.url, width: file.width, height: file.height });

// Covers and portraits have no alt field of their own, so their alt text is the media file's alternativeText.
export const coverImage = mediaFileWithAlt.transform((file): Image => toImage(file, file.alternativeText));
export const draftCover = draftMediaFile.nullish().transform((file) => (file ? toDraftImage(file, file.alternativeText) : undefined));

export const figureSchema = z
  .object({ image: mediaFile, alt: requiredText, caption: maybeText })
  .transform((value): Figure => ({ image: toImage(value.image, value.alt), caption: value.caption }));
export const draftFigureSchema = z
  .object({ image: mediaFile.nullish(), alt: maybeText, caption: maybeText })
  .transform((value): Draft<Figure> => ({ image: value.image ? toDraftImage(value.image, value.alt) : undefined, caption: value.caption }));

const seoShape = { metaTitle: maybeText, metaDescription: maybeText, shareImage: mediaFile.nullish() };
const toSeo = (value: { metaTitle?: string; metaDescription?: string; shareImage?: MediaFile | null }): Seo => ({
  metaTitle: value.metaTitle,
  metaDescription: value.metaDescription,
  shareImage: value.shareImage ? toShareImage(value.shareImage) : undefined,
});
export const seoGroup = z.object(seoShape).transform(toSeo);
// A missing SEO group is not an error: empty fields fall back to the defaults in Site Settings.
export const seo = seoGroup.nullable().transform((value): Seo => value ?? {});
export const draftSeo = seoGroup.nullish().transform((value): Seo => value ?? {});

export const linkSchema = z.object({ label: requiredText, href: z.string().regex(LINK_HREF) }).transform((value): Link => value);
export const draftLinkSchema = z
  .object({ label: maybeText, href: maybe(z.string().regex(LINK_HREF)) })
  .transform((value): Draft<Link> => value);

const pagination = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  pageCount: z.number().int(),
  total: z.number().int(),
});

// zod cannot name the output of an object whose only property is a generic schema, hence the cast.
export const single = <T extends z.ZodType>(item: T) =>
  z.object({ data: item }).transform((response) => (response as unknown as { data: z.output<T> }).data);
// A broken document is dropped from the list and reported, so pagination.total can count more than items.
export const collection = <T extends z.ZodType>(item: T, what: string) =>
  z
    .object({ data: tolerantList(what, item), meta: z.object({ pagination }) })
    .transform((response): Collection<z.output<T>> => ({ items: response.data, pagination: response.meta.pagination }));
