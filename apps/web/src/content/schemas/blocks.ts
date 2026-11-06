import { z } from 'zod';
import type { Block, Draft } from '../types';
import { draftRichText, richText } from './rich-text';
import { draftTeamMemberRef, teamMemberRef } from './references';
import { draftFigureSchema, figureSchema, list, maybe, maybeText, mediaFile, populated, requiredText, toDraftImage, toImage } from './shared';

const drawingKind = z.enum(['plan', 'section', 'elevation']);

const blockWire = z.discriminatedUnion('__component', [
  z.object({ __component: z.literal('blocks.text'), body: richText }),
  z.object({ __component: z.literal('blocks.image'), image: mediaFile, alt: requiredText, caption: maybeText }),
  z.object({ __component: z.literal('blocks.image-pair'), left: figureSchema, right: figureSchema }),
  z.object({ __component: z.literal('blocks.gallery'), items: z.array(figureSchema).min(1, 'A Gallery needs at least one image') }),
  z.object({ __component: z.literal('blocks.quote'), text: requiredText, speaker: populated(teamMemberRef()) }),
  z.object({ __component: z.literal('blocks.drawing'), kind: drawingKind, image: mediaFile, alt: requiredText, caption: requiredText }),
]);

export const blockSchema = blockWire.transform((value): Block => {
  switch (value.__component) {
    case 'blocks.text':
      return { type: 'text', body: value.body };
    case 'blocks.image':
      return { type: 'image', image: toImage(value.image, value.alt), caption: value.caption };
    case 'blocks.image-pair':
      return { type: 'imagePair', left: value.left, right: value.right };
    case 'blocks.gallery':
      return { type: 'gallery', items: value.items };
    case 'blocks.quote':
      return { type: 'quote', text: value.text, speaker: value.speaker };
    case 'blocks.drawing':
      return { type: 'drawing', kind: value.kind, image: toImage(value.image, value.alt), caption: value.caption };
  }
});

const draftBlockWire = z.discriminatedUnion('__component', [
  z.object({ __component: z.literal('blocks.text'), body: draftRichText }),
  z.object({ __component: z.literal('blocks.image'), image: mediaFile.nullish(), alt: maybeText, caption: maybeText }),
  z.object({ __component: z.literal('blocks.image-pair'), left: draftFigureSchema.nullish(), right: draftFigureSchema.nullish() }),
  z.object({ __component: z.literal('blocks.gallery'), items: list(draftFigureSchema) }),
  z.object({ __component: z.literal('blocks.quote'), text: maybeText, speaker: draftTeamMemberRef.nullish() }),
  z.object({ __component: z.literal('blocks.drawing'), kind: maybe(drawingKind), image: mediaFile.nullish(), alt: maybeText, caption: maybeText }),
]);

export const draftBlockSchema = draftBlockWire.transform((value): Draft<Block> => {
  switch (value.__component) {
    case 'blocks.text':
      return { type: 'text', body: value.body };
    case 'blocks.image':
      return { type: 'image', image: value.image ? toDraftImage(value.image, value.alt) : undefined, caption: value.caption };
    case 'blocks.image-pair':
      return { type: 'imagePair', left: value.left ?? undefined, right: value.right ?? undefined };
    case 'blocks.gallery':
      return { type: 'gallery', items: value.items };
    case 'blocks.quote':
      return { type: 'quote', text: value.text, speaker: value.speaker ?? undefined };
    case 'blocks.drawing':
      return {
        type: 'drawing',
        kind: value.kind,
        image: value.image ? toDraftImage(value.image, value.alt) : undefined,
        caption: value.caption,
      };
  }
});

export const bodySchema = z.array(blockSchema);
export const draftBodySchema = list(draftBlockSchema);
