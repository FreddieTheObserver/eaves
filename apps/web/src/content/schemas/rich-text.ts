import { z } from 'zod';
import type { RichText, RichTextList } from '../types';

// Rich text links may also point at an email address or a phone number, unlike a Link, but never at a
// script or data URL.
const URL_PATTERN = /^(\/(?!\/)|https?:\/\/|mailto:|tel:)\S*$/;

const textNode = z.object({
  type: z.literal('text'),
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strikethrough: z.boolean().optional(),
  code: z.boolean().optional(),
});
const linkNode = z.object({ type: z.literal('link'), url: z.string().regex(URL_PATTERN), children: z.array(textNode) });
const inline = z.union([textNode, linkNode]);
const listItem = z.object({ type: z.literal('list-item'), children: z.array(inline) });

// A nested list sits inside its parent list, which is how the Strapi editor indents.
const list: z.ZodType<RichTextList> = z.lazy(() =>
  z.object({ type: z.literal('list'), format: z.enum(['ordered', 'unordered']), children: z.array(z.union([listItem, list])) })
);

// An image node is left out on purpose: the Image Block carries the alt text that a node cannot.
const node = z.union([
  z.object({ type: z.literal('paragraph'), children: z.array(inline) }),
  z.object({ type: z.literal('heading'), level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]), children: z.array(inline) }),
  z.object({ type: z.literal('quote'), children: z.array(inline) }),
  z.object({ type: z.literal('code'), children: z.array(inline) }),
  list,
]);

export const richText = z.array(node).min(1, 'Text needs at least one paragraph');
export const draftRichText = z
  .array(node)
  .nullish()
  .transform((value): RichText => value ?? []);
