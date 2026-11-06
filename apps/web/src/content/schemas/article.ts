import { z } from 'zod';
import type { Article, ArticleCard, Draft } from '../types';
import { bodySchema, draftBodySchema } from './blocks';
import { projectCardDraftSchema, projectCardSchema } from './project';
import { draftTeamMemberRef, draftTopicRef, teamMemberRef, topicRef } from './references';
import { coverImage, draftCover, draftSeo, list, maybeText, requiredText, seo } from './shared';

const publicationDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Publication date must be a calendar date');

const cardWire = z.object({
  documentId: requiredText,
  locale: requiredText,
  slug: requiredText,
  title: requiredText,
  excerpt: requiredText,
  cover: coverImage,
  topic: topicRef('An Article must have a Topic'),
  publicationDate,
});

const toCard = (value: z.output<typeof cardWire>): ArticleCard => ({
  id: value.documentId,
  locale: value.locale,
  slug: value.slug,
  title: value.title,
  excerpt: value.excerpt,
  cover: value.cover,
  topic: value.topic,
  publicationDate: value.publicationDate,
});

export const articleCardSchema = cardWire.transform(toCard);

export const articleSchema = cardWire
  .extend({
    byline: z.array(teamMemberRef()).min(1, 'An Article must name at least one Team Member in its Byline'),
    relatedProjects: z.array(projectCardSchema),
    body: bodySchema,
    seo,
  })
  .transform(
    (value): Article => ({
      ...toCard(value),
      byline: value.byline,
      relatedProjects: value.relatedProjects,
      body: value.body,
      seo: value.seo,
    })
  );

export const articleDraftSchema = z
  .object({
    documentId: requiredText,
    locale: requiredText,
    slug: maybeText,
    title: maybeText,
    excerpt: maybeText,
    cover: draftCover,
    topic: draftTopicRef.nullish(),
    publicationDate: maybeText,
    byline: list(draftTeamMemberRef),
    relatedProjects: list(projectCardDraftSchema),
    body: draftBodySchema,
    seo: draftSeo,
  })
  .transform(
    (value): Draft<Article> => ({
      id: value.documentId,
      locale: value.locale,
      slug: value.slug,
      title: value.title,
      excerpt: value.excerpt,
      cover: value.cover,
      topic: value.topic ?? undefined,
      publicationDate: value.publicationDate,
      byline: value.byline,
      relatedProjects: value.relatedProjects,
      body: value.body,
      seo: value.seo,
    })
  );
