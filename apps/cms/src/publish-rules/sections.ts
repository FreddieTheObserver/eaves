import type { Core } from '@strapi/strapi';

export const SECTION_PAGES = ['api::home-page.home-page', 'api::studio-page.studio-page'];

// Strapi leaves out any component the populate does not name, which would shift the Section numbers in a
// message, so every component the dynamic zone allows is named.
export const everySection = (strapi: Core.Strapi, uid: string, populate: Record<string, unknown>) => {
  const contentTypes = strapi.contentTypes as unknown as Record<string, { attributes: { sections?: { components?: string[] } } }>;
  const components = contentTypes[uid].attributes.sections?.components ?? [];
  return { sections: { on: Object.fromEntries(components.map((component) => [component, populate[component] ?? { populate: '*' }])) } };
};
