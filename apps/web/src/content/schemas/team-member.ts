import { z } from 'zod';
import type { Draft, TeamMember } from '../types';
import { coverImage, draftCover, maybe, maybeText, requiredText } from './shared';

export const teamMemberSchema = z
  .object({
    documentId: requiredText,
    locale: requiredText,
    name: requiredText,
    position: requiredText,
    portrait: coverImage,
    bio: requiredText,
    order: z.number().int(),
  })
  .transform(
    (value): TeamMember => ({
      id: value.documentId,
      locale: value.locale,
      name: value.name,
      position: value.position,
      portrait: value.portrait,
      bio: value.bio,
      order: value.order,
    })
  );

export const teamMemberDraftSchema = z
  .object({
    documentId: requiredText,
    locale: requiredText,
    name: maybeText,
    position: maybeText,
    portrait: draftCover,
    bio: maybeText,
    order: maybe(z.number().int()),
  })
  .transform(
    (value): Draft<TeamMember> => ({
      id: value.documentId,
      locale: value.locale,
      name: value.name,
      position: value.position,
      portrait: value.portrait,
      bio: value.bio,
      order: value.order,
    })
  );
