import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { altTextRule } from './alt-text';
import { dependentProblems, describeDocument } from './dependents';
import type { Locale } from './published';
import { requiredRelationsRule } from './relations';
import { reservedSlugRule } from './reserved-slugs';
import { selectedProjectsRule } from './selected-projects';
import type { PublishRule } from './types';

const RULES: PublishRule[] = [altTextRule, requiredRelationsRule, selectedProjectsRule, reservedSlugRule];
const SHOWN = 5;

type Params = { documentId?: string; locale?: Locale; status?: string };
type AdminRequest = { path?: string; body?: { documentIds?: unknown } };

const BULK_REMOVAL = /\/actions\/(?:bulkUnpublish|bulkDelete)$/;

// The admin's bulk Unpublish and Delete call the Document Service once per document, all at the same moment, so each
// call would see the others still published. Every document in the request counts as removed for every check.
const removedTogether = (strapi: Core.Strapi, uid: string, documentId: string): string[] => {
  const context = strapi.requestContext.get() as { params?: { model?: string }; request?: AdminRequest } | undefined;
  const ids = context?.request?.body?.documentIds;
  const isBulk = BULK_REMOVAL.test(context?.request?.path ?? '') && context?.params?.model === uid && Array.isArray(ids);
  return isBulk ? [...new Set([documentId, ...ids.filter((id): id is string => typeof id === 'string')])] : [documentId];
};

// The CMS refuses what the web app's schemas refuse.
// Every editorial path ends in these Document Service actions: the admin's Publish and Unpublish buttons, their
// bulk versions, and Delete. A create or update with status "published" publishes through an internal function
// that skips middleware, so it is refused rather than left as a bypass.
export const registerPublishRules = (strapi: Core.Strapi) => {
  strapi.documents.use(async (context, next) => {
    const params = context.params as Params;
    const { action, uid } = context;

    if (action === 'unpublish' || action === 'delete') {
      const removed = params.documentId ? removedTogether(strapi, uid, params.documentId) : [];
      const problems = await dependentProblems(strapi, uid, removed, params.locale);
      if (problems.length === 0) return next();

      const name = await describeDocument(strapi, uid, params.documentId as string, params.locale);
      const shown = problems.slice(0, SHOWN).join(' ');
      const more = problems.length > SHOWN ? ` And ${problems.length - SHOWN} more.` : '';
      const verb = action === 'delete' ? 'delete' : 'unpublish';
      throw new errors.ValidationError(`Cannot ${verb} ${name}. Published pages still depend on it. ${shown}${more}`, { errors: problems });
    }

    const rules = RULES.filter((rule) => rule.uids.includes(uid));
    if (rules.length === 0) return next();

    if ((action === 'create' || action === 'update') && params.status === 'published') {
      throw new errors.ValidationError(`Save ${uid} as a draft, then publish it, so the publish rules can check it.`);
    }
    if (action !== 'publish') return next();

    const problems: string[] = [];
    for (const rule of rules) {
      const drafts = await strapi.documents(uid).findMany({
        filters: { documentId: params.documentId },
        locale: params.locale,
        status: 'draft',
        populate: rule.populate(uid, strapi),
      } as never);
      for (const draft of drafts) problems.push(...(await rule.problems(uid, draft as Record<string, unknown>, strapi)));
    }
    if (problems.length > 0) throw new errors.ValidationError(`Cannot publish. ${problems.join(' ')}`, { errors: problems });

    return next();
  });
};
