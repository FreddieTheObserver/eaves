import { z } from 'zod';
import type { Draft, ServiceRef, TeamMemberRef, Topic, Typology } from '../types';
import { maybeText, requiredText } from './shared';

// The error is what a null relation reports. Strapi cannot mark a relation required, so a missing one
// arrives as null or an empty list and each schema that needs it says so in its own words.
const missing = (message: string) => ({ error: () => message });

const named = { documentId: requiredText, name: requiredText, slug: requiredText };
const draftNamed = { documentId: requiredText, name: maybeText, slug: maybeText };

export const typologyRef = (message = 'A Typology is required') =>
  z.object(named, missing(message)).transform((value): Typology => ({ id: value.documentId, name: value.name, slug: value.slug }));
export const topicRef = (message = 'A Topic is required') =>
  z.object(named, missing(message)).transform((value): Topic => ({ id: value.documentId, name: value.name, slug: value.slug }));
export const serviceRef = (message = 'A Service is required') =>
  z.object(named, missing(message)).transform((value): ServiceRef => ({ id: value.documentId, name: value.name, slug: value.slug }));
export const teamMemberRef = (message = 'A Team Member is required') =>
  z
    .object({ documentId: requiredText, name: requiredText, position: requiredText }, missing(message))
    .transform((value): TeamMemberRef => ({ id: value.documentId, name: value.name, position: value.position }));

export const draftTypologyRef = z
  .object(draftNamed)
  .transform((value): Draft<Typology> => ({ id: value.documentId, name: value.name, slug: value.slug }));
export const draftTopicRef = z
  .object(draftNamed)
  .transform((value): Draft<Topic> => ({ id: value.documentId, name: value.name, slug: value.slug }));
export const draftServiceRef = z
  .object(draftNamed)
  .transform((value): Draft<ServiceRef> => ({ id: value.documentId, name: value.name, slug: value.slug }));
export const draftTeamMemberRef = z
  .object({ documentId: requiredText, name: maybeText, position: maybeText })
  .transform((value): Draft<TeamMemberRef> => ({ id: value.documentId, name: value.name, position: value.position }));

export const typologySchema = typologyRef();
export const topicSchema = topicRef();
