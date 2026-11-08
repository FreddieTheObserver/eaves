import type { Core } from '@strapi/strapi';
import { documentIds, list, named, publishedIds, type Doc } from './published';
import type { PublishRule } from './types';

const PROJECT = 'api::project.project';
const ARTICLE = 'api::article.article';
const SERVICE = 'api::service.service';
const TEAM_MEMBER = 'api::team-member.team-member';

const projectProblems = async (strapi: Core.Strapi, draft: Doc) => {
  const problems: string[] = [];
  const locale = draft.locale as string | undefined;
  if (!draft.typology) problems.push('Choose a Typology.');

  const services = list(draft.services);
  const publishedServices = await publishedIds(strapi, SERVICE, documentIds(services), locale);
  if (services.length === 0) problems.push('Choose at least one Service.');
  else if (publishedServices.size === 0) problems.push(`None of its Services is published yet (${services.map(named).join(', ')}). Publish one of them first.`);

  const credits = list(draft.credits);
  const members = credits.flatMap((credit) => (credit.teamMember ? [credit.teamMember as Doc] : []));
  const publishedMembers = await publishedIds(strapi, TEAM_MEMBER, documentIds(members), locale);
  credits.forEach((credit, index) => {
    const member = credit.teamMember as Doc | null | undefined;
    const label = credit.role ? `Credit ${index + 1} (${String(credit.role)})` : `Credit ${index + 1}`;
    if (!member) problems.push(`${label} names no Team Member.`);
    else if (!publishedMembers.has(member.documentId as string)) problems.push(`${label} names ${named(member)}, who is not published yet. Publish them first.`);
  });
  return problems;
};

const articleProblems = async (strapi: Core.Strapi, draft: Doc) => {
  const problems: string[] = [];
  if (!draft.topic) problems.push('Choose a Topic.');

  const byline = list(draft.byline);
  const published = await publishedIds(strapi, TEAM_MEMBER, documentIds(byline), draft.locale as string | undefined);
  if (byline.length === 0) problems.push('Add at least one Team Member to the Byline.');
  else if (published.size === 0) problems.push(`Nobody in the Byline is published yet (${byline.map(named).join(', ')}). Publish one of them first.`);
  return problems;
};

// Strapi leaves a related document that is not published out of the published page, so a required relation
// must reach a published document. A Service or Byline person who is not published yet, next to one who is,
// is left out of the page without blocking the publish, as the web app allows.
export const requiredRelationsRule: PublishRule = {
  uids: [PROJECT, ARTICLE],
  populate: (uid) =>
    uid === PROJECT ? { typology: true, services: true, credits: { populate: { teamMember: true } } } : { topic: true, byline: true },
  problems: (uid, draft, strapi) => (uid === PROJECT ? projectProblems(strapi, draft) : articleProblems(strapi, draft)),
};
