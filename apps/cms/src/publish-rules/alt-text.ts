import type { PublishRule } from './types';

// Covers and portraits have no alt field of their own, so their alt text is the media file's alternativeText.
const MEDIA_FIELDS: Record<string, { field: string; label: string }> = {
  'api::project.project': { field: 'cover', label: 'cover image' },
  'api::service.service': { field: 'cover', label: 'cover image' },
  'api::article.article': { field: 'cover', label: 'cover image' },
  'api::team-member.team-member': { field: 'portrait', label: 'portrait' },
};

const SECTION_PAGES = ['api::home-page.home-page', 'api::studio-page.studio-page'];
const IMAGE_SECTIONS: Record<string, string> = {
  'sections.statement': 'Statement',
  'sections.studio-introduction': 'Studio introduction',
};

const isBlank = (value: unknown) => typeof value !== 'string' || value.trim() === '';
const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;

// Every image shown on a page needs alt text. Strapi can require it on a Block, but not on a cover, and not
// on a Section's imageAlt only when its image is set. A share image is never shown on the page, so it is exempt.
export const altTextRule: PublishRule = {
  uids: [...Object.keys(MEDIA_FIELDS), ...SECTION_PAGES],

  populate: (uid, strapi) => {
    const media = MEDIA_FIELDS[uid];
    if (media) return { [media.field]: true };

    // Strapi leaves out any component the populate does not name, which would shift the Section numbers
    // in the message, so every component the dynamic zone allows is named.
    const contentTypes = strapi.contentTypes as unknown as Record<string, { attributes: { sections?: { components?: string[] } } }>;
    const components = contentTypes[uid].attributes.sections?.components ?? [];
    return {
      sections: { on: Object.fromEntries(components.map((component) => [component, component in IMAGE_SECTIONS ? { populate: ['image'] } : { populate: '*' }])) },
    };
  },

  problems: (uid, draft) => {
    const media = MEDIA_FIELDS[uid];
    if (media) {
      const file = record(draft[media.field]);
      return file && isBlank(file.alternativeText)
        ? [`The ${media.label} has no alternative text. Add it in the Media Library, then publish again.`]
        : [];
    }

    const sections = Array.isArray(draft.sections) ? draft.sections : [];
    return sections.flatMap((section, index) => {
      const { __component: component, image, imageAlt } = record(section) ?? {};
      const label = typeof component === 'string' ? IMAGE_SECTIONS[component] : undefined;
      return label && image && isBlank(imageAlt) ? [`Section ${index + 1} (${label}) has an image but no alt text.`] : [];
    });
  },
};
