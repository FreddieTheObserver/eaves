import { z } from 'zod';
import type { Credit, Draft, Project, ProjectCard } from '../types';
import { bodySchema, draftBodySchema } from './blocks';
import { draftServiceRef, draftTeamMemberRef, draftTypologyRef, serviceRef, teamMemberRef, typologyRef } from './references';
import { coverImage, draftCover, draftSeo, list, maybe, requiredText, seo } from './shared';

const stage = z.enum(['completed', 'under_construction', 'concept']);

const cardShape = {
  documentId: requiredText,
  locale: requiredText,
  slug: requiredText,
  title: requiredText,
  summary: requiredText,
  cover: coverImage,
  typology: typologyRef('A Project must have a Typology'),
  neighbourhood: requiredText,
  city: requiredText,
  year: z.number().int(),
  stage,
};
const cardWire = z.object(cardShape);

const toCard = (value: z.output<typeof cardWire>): ProjectCard => ({
  id: value.documentId,
  locale: value.locale,
  slug: value.slug,
  title: value.title,
  summary: value.summary,
  cover: value.cover,
  typology: value.typology,
  location: { neighbourhood: value.neighbourhood, city: value.city },
  year: value.year,
  stage: value.stage,
});

export const projectCardSchema = cardWire.transform(toCard);

const creditSchema = z
  .object({ role: requiredText, teamMember: teamMemberRef('A Credit must name a Team Member') })
  .transform((value): Credit => value);

export const projectSchema = cardWire
  .extend({
    floorArea: z.number().int(),
    services: z.array(serviceRef()).min(1, 'A Project must have at least one Service'),
    credits: z.array(creditSchema),
    body: bodySchema,
    seo,
  })
  .transform(
    (value): Project => ({
      ...toCard(value),
      floorArea: value.floorArea,
      services: value.services,
      credits: value.credits,
      body: value.body,
      seo: value.seo,
    })
  );

const draftCardShape = {
  documentId: requiredText,
  locale: requiredText,
  slug: maybe(z.string().min(1)),
  title: maybe(z.string().min(1)),
  summary: maybe(z.string().min(1)),
  cover: draftCover,
  typology: draftTypologyRef.nullish(),
  neighbourhood: maybe(z.string().min(1)),
  city: maybe(z.string().min(1)),
  year: maybe(z.number().int()),
  stage: maybe(stage),
};
const draftCardWire = z.object(draftCardShape);

const toDraftCard = (value: z.output<typeof draftCardWire>): Draft<ProjectCard> => ({
  id: value.documentId,
  locale: value.locale,
  slug: value.slug,
  title: value.title,
  summary: value.summary,
  cover: value.cover,
  typology: value.typology ?? undefined,
  location: { neighbourhood: value.neighbourhood, city: value.city },
  year: value.year,
  stage: value.stage,
});

export const projectCardDraftSchema = draftCardWire.transform(toDraftCard);

const draftCreditSchema = z
  .object({ role: maybe(z.string().min(1)), teamMember: draftTeamMemberRef.nullish() })
  .transform((value): Draft<Credit> => ({ role: value.role, teamMember: value.teamMember ?? undefined }));

export const projectDraftSchema = draftCardWire
  .extend({
    floorArea: maybe(z.number().int()),
    services: list(draftServiceRef),
    credits: list(draftCreditSchema),
    body: draftBodySchema,
    seo: draftSeo,
  })
  .transform(
    (value): Draft<Project> => ({
      ...toDraftCard(value),
      floorArea: value.floorArea,
      services: value.services,
      credits: value.credits,
      body: value.body,
      seo: value.seo,
    })
  );
