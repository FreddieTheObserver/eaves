import { z } from 'zod';
import type { Draft, Section, SectionsPage } from '../types';
import { projectCardDraftSchema, projectCardSchema } from './project';
import { draftSeo, list, maybeText, mediaFile, populated, requiredText, seo, toDraftImage, toImage } from './shared';

// Strapi cannot require imageAlt only when image is set, so each Section with an image checks it here.
// An imageAlt of only spaces reads as missing, because maybeText drops it.
const altWhenImage = (section: { image?: unknown; imageAlt?: string }) => !section.image || Boolean(section.imageAlt);
const altRule = { error: 'Alt text is required when an image is set', path: ['imageAlt'] };

const SELECTED_PROJECTS_MESSAGE = 'Selected Projects needs between three and six Projects';

const sectionWire = z.discriminatedUnion('__component', [
  z
    .object({ __component: z.literal('sections.statement'), text: requiredText, image: populated(mediaFile), imageAlt: maybeText })
    .refine(altWhenImage, altRule),
  z.object({
    __component: z.literal('sections.selected-projects'),
    heading: maybeText,
    projects: z.array(projectCardSchema).min(3, SELECTED_PROJECTS_MESSAGE).max(6, SELECTED_PROJECTS_MESSAGE),
  }),
  z.object({ __component: z.literal('sections.services-overview'), heading: requiredText, intro: maybeText }),
  z.object({ __component: z.literal('sections.latest-articles'), heading: requiredText }),
  z
    .object({
      __component: z.literal('sections.studio-introduction'),
      heading: requiredText,
      text: requiredText,
      image: populated(mediaFile),
      imageAlt: maybeText,
      linkLabel: requiredText,
    })
    .refine(altWhenImage, altRule),
  z.object({ __component: z.literal('sections.team'), heading: requiredText, intro: maybeText }),
  z.object({
    __component: z.literal('sections.figures'),
    heading: maybeText,
    items: z.array(z.object({ value: requiredText, label: requiredText })).min(1, 'Figures needs at least one figure'),
  }),
  z.object({ __component: z.literal('sections.contact-prompt'), heading: requiredText, text: maybeText, linkLabel: requiredText }),
]);

export const sectionSchema = sectionWire.transform((value): Section => {
  switch (value.__component) {
    case 'sections.statement':
      return { type: 'statement', text: value.text, image: value.image && toImage(value.image, value.imageAlt ?? '') };
    case 'sections.selected-projects':
      return { type: 'selectedProjects', heading: value.heading, projects: value.projects };
    case 'sections.services-overview':
      return { type: 'servicesOverview', heading: value.heading, intro: value.intro };
    case 'sections.latest-articles':
      return { type: 'latestArticles', heading: value.heading };
    case 'sections.studio-introduction':
      return {
        type: 'studioIntroduction',
        heading: value.heading,
        text: value.text,
        image: value.image && toImage(value.image, value.imageAlt ?? ''),
        linkLabel: value.linkLabel,
      };
    case 'sections.team':
      return { type: 'team', heading: value.heading, intro: value.intro };
    case 'sections.figures':
      return { type: 'figures', heading: value.heading, items: value.items };
    case 'sections.contact-prompt':
      return { type: 'contactPrompt', heading: value.heading, text: value.text, linkLabel: value.linkLabel };
  }
});

const draftSectionWire = z.discriminatedUnion('__component', [
  z.object({ __component: z.literal('sections.statement'), text: maybeText, image: mediaFile.nullish(), imageAlt: maybeText }),
  z.object({ __component: z.literal('sections.selected-projects'), heading: maybeText, projects: list(projectCardDraftSchema) }),
  z.object({ __component: z.literal('sections.services-overview'), heading: maybeText, intro: maybeText }),
  z.object({ __component: z.literal('sections.latest-articles'), heading: maybeText }),
  z.object({
    __component: z.literal('sections.studio-introduction'),
    heading: maybeText,
    text: maybeText,
    image: mediaFile.nullish(),
    imageAlt: maybeText,
    linkLabel: maybeText,
  }),
  z.object({ __component: z.literal('sections.team'), heading: maybeText, intro: maybeText }),
  z.object({
    __component: z.literal('sections.figures'),
    heading: maybeText,
    items: list(z.object({ value: maybeText, label: maybeText })),
  }),
  z.object({ __component: z.literal('sections.contact-prompt'), heading: maybeText, text: maybeText, linkLabel: maybeText }),
]);

export const draftSectionSchema = draftSectionWire.transform((value): Draft<Section> => {
  switch (value.__component) {
    case 'sections.statement':
      return { type: 'statement', text: value.text, image: value.image ? toDraftImage(value.image, value.imageAlt) : undefined };
    case 'sections.selected-projects':
      return { type: 'selectedProjects', heading: value.heading, projects: value.projects };
    case 'sections.services-overview':
      return { type: 'servicesOverview', heading: value.heading, intro: value.intro };
    case 'sections.latest-articles':
      return { type: 'latestArticles', heading: value.heading };
    case 'sections.studio-introduction':
      return {
        type: 'studioIntroduction',
        heading: value.heading,
        text: value.text,
        image: value.image ? toDraftImage(value.image, value.imageAlt) : undefined,
        linkLabel: value.linkLabel,
      };
    case 'sections.team':
      return { type: 'team', heading: value.heading, intro: value.intro };
    case 'sections.figures':
      return { type: 'figures', heading: value.heading, items: value.items };
    case 'sections.contact-prompt':
      return { type: 'contactPrompt', heading: value.heading, text: value.text, linkLabel: value.linkLabel };
  }
});

// The Home page and the Studio page share one catalogue of Sections, so they share these schemas.
export const sectionsPageSchema = z
  .object({ documentId: requiredText, locale: requiredText, sections: z.array(sectionSchema), seo })
  .transform((value): SectionsPage => ({ id: value.documentId, locale: value.locale, sections: value.sections, seo: value.seo }));

export const sectionsPageDraftSchema = z
  .object({ documentId: requiredText, locale: requiredText, sections: list(draftSectionSchema), seo: draftSeo })
  .transform((value): Draft<SectionsPage> => ({ id: value.documentId, locale: value.locale, sections: value.sections, seo: value.seo }));
