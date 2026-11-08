import { RESERVED_PAGE_SLUGS } from './content-rules';
import type { PublishRule } from './types';

// A Page at /[slug] would shadow one of the web app's routes.
export const reservedSlugRule: PublishRule = {
  uids: ['api::page.page'],
  populate: () => ({}),
  problems: (_uid, draft) => {
    const slug = typeof draft.slug === 'string' ? draft.slug.trim().toLowerCase() : '';
    return RESERVED_PAGE_SLUGS.includes(slug)
      ? [`The slug "${String(draft.slug)}" is reserved for a route (${RESERVED_PAGE_SLUGS.join(', ')}). Choose another.`]
      : [];
  },
};
