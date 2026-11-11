import 'server-only';
import type { API } from '@strapi/client';
import { cacheLife, cacheTag } from 'next/cache';
import { UIDS } from '../catalog';
import { draftClient, readClient } from '../client';
import populate from '../populate.json';
import { teamMemberDraftSchema, teamMemberSchema } from '../schemas';
import { listCacheTags, teamMemberCacheTags } from '../tags';
import type { Collection, TeamMember, TeamMemberDraft } from '../types';
import { DEFAULT_LOCALE, readCollection } from './shared';

const listQuery = (locale: string): API.BaseQueryParams => ({
  locale,
  sort: 'order:asc',
  populate: populate.teamMember,
});

export async function getPublishedTeamMembers(locale = DEFAULT_LOCALE): Promise<Collection<TeamMember>> {
  'use cache';
  cacheLife('max');

  const response = await readClient().collection('team-members').find(listQuery(locale));
  const page = readCollection('Team Member', teamMemberSchema, response);
  cacheTag(...listCacheTags(UIDS.teamMember, page.items, teamMemberCacheTags));
  return page;
}

export async function getDraftTeamMembers(locale = DEFAULT_LOCALE): Promise<Collection<TeamMemberDraft>> {
  const query: API.BaseQueryParams = { ...listQuery(locale), status: 'draft' };
  const response = await draftClient().collection('team-members').find(query);
  return readCollection('Team Member', teamMemberDraftSchema, response);
}
