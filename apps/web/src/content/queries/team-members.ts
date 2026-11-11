import 'server-only';
import type { API } from '@strapi/client';
import { cacheLife, cacheTag } from 'next/cache';
import { RESOURCES, UIDS } from '../catalog';
import { draftClient, readClient } from '../client';
import populate from '../populate.json';
import { teamMemberDraftSchema, teamMemberSchema } from '../schemas';
import { listCacheTags, teamMemberCacheTags } from '../tags';
import type { Collection, TeamMember, TeamMemberDraft } from '../types';
import { DEFAULT_LOCALE, readEvery, tagDropped } from './shared';

const listQuery = (locale: string): API.BaseQueryParams => ({
  locale,
  sort: ['order:asc', 'name:asc'],
  populate: populate.teamMember,
});

export async function getPublishedTeamMembers(locale = DEFAULT_LOCALE): Promise<Collection<TeamMember>> {
  'use cache';
  cacheLife('max');

  const page = await readEvery(
    'Team Member',
    teamMemberSchema,
    (pagination) => readClient().collection(RESOURCES.teamMember).find({ ...listQuery(locale), pagination }),
    tagDropped
  );
  cacheTag(...listCacheTags(UIDS.teamMember, page.items, teamMemberCacheTags));
  return page;
}

export async function getDraftTeamMembers(locale = DEFAULT_LOCALE): Promise<Collection<TeamMemberDraft>> {
  return readEvery('Team Member', teamMemberDraftSchema, (pagination) =>
    draftClient()
      .collection(RESOURCES.teamMember)
      .find({ ...listQuery(locale), status: 'draft', pagination })
  );
}
