import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { altTextRule } from './alt-text';
import type { PublishRule } from './types';

const RULES: PublishRule[] = [altTextRule];

type PublishParams = { documentId?: string; locale?: string | string[]; status?: string };

// Both the admin's Publish button and its bulk publish end in the Document Service's publish, so one
// middleware there covers every editorial path. A create or update with status "published" publishes
// through an internal function that skips middleware, so it is refused rather than left as a bypass.
export const registerPublishRules = (strapi: Core.Strapi) => {
  strapi.documents.use(async (context, next) => {
    const rules = RULES.filter((rule) => rule.uids.includes(context.uid));
    if (rules.length === 0) return next();

    const params = context.params as PublishParams;
    if ((context.action === 'create' || context.action === 'update') && params.status === 'published') {
      throw new errors.ValidationError(`Save ${context.uid} as a draft, then publish it, so the publish rules can check it.`);
    }
    if (context.action !== 'publish') return next();

    const problems: string[] = [];
    for (const rule of rules) {
      const drafts = await strapi.documents(context.uid).findMany({
        filters: { documentId: params.documentId },
        locale: params.locale,
        status: 'draft',
        populate: rule.populate(context.uid, strapi),
      } as never);
      for (const draft of drafts) problems.push(...rule.problems(context.uid, draft as Record<string, unknown>));
    }
    if (problems.length > 0) throw new errors.ValidationError(`Cannot publish. ${problems.join(' ')}`, { errors: problems });

    return next();
  });
};
