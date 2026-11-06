import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { altTextRule } from './alt-text';
import { dependentProblems, describeDocument, type Locale } from './dependents';
import type { PublishRule } from './types';

const RULES: PublishRule[] = [altTextRule];
const SHOWN = 5;

type Params = { documentId?: string; locale?: Locale; status?: string };

// The CMS refuses what the web app's schemas refuse.
// Every editorial path ends in these Document Service actions: the admin's Publish and Unpublish buttons, their
// bulk versions, and Delete. A create or update with status "published" publishes through an internal function
// that skips middleware, so it is refused rather than left as a bypass.
export const registerPublishRules = (strapi: Core.Strapi) => {
  strapi.documents.use(async (context, next) => {
    const params = context.params as Params;
    const { action, uid } = context;

    if (action === 'unpublish' || action === 'delete') {
      const problems = await dependentProblems(strapi, uid, params.documentId, params.locale);
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
      for (const draft of drafts) problems.push(...rule.problems(uid, draft as Record<string, unknown>));
    }
    if (problems.length > 0) throw new errors.ValidationError(`Cannot publish. ${problems.join(' ')}`, { errors: problems });

    return next();
  });
};
