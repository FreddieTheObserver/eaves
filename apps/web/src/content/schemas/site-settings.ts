import { z } from 'zod';
import type { Draft, SiteSettings } from '../types';
import { draftLinkSchema, draftSeo, linkSchema, list, maybeText, requiredText, seoGroup } from './shared';
import { tolerantList } from './tolerance';

export const siteSettingsSchema = z
  .object({
    documentId: requiredText,
    locale: requiredText,
    contactEmail: z.email(),
    contactLocation: maybeText,
    socialLinks: tolerantList('Social link', linkSchema),
    headerNavigation: tolerantList('Header navigation link', linkSchema),
    footerNavigation: tolerantList('Footer navigation link', linkSchema),
    demoNotice: requiredText,
    notFoundTitle: requiredText,
    notFoundText: requiredText,
    defaultSeo: seoGroup,
  })
  .transform(
    (value): SiteSettings => ({
      id: value.documentId,
      locale: value.locale,
      contactEmail: value.contactEmail,
      contactLocation: value.contactLocation,
      socialLinks: value.socialLinks,
      headerNavigation: value.headerNavigation,
      footerNavigation: value.footerNavigation,
      demoNotice: value.demoNotice,
      notFound: { title: value.notFoundTitle, text: value.notFoundText },
      defaultSeo: value.defaultSeo,
    })
  );

export const siteSettingsDraftSchema = z
  .object({
    documentId: requiredText,
    locale: requiredText,
    contactEmail: maybeText,
    contactLocation: maybeText,
    socialLinks: list(draftLinkSchema),
    headerNavigation: list(draftLinkSchema),
    footerNavigation: list(draftLinkSchema),
    demoNotice: maybeText,
    notFoundTitle: maybeText,
    notFoundText: maybeText,
    defaultSeo: draftSeo,
  })
  .transform(
    (value): Draft<SiteSettings> => ({
      id: value.documentId,
      locale: value.locale,
      contactEmail: value.contactEmail,
      contactLocation: value.contactLocation,
      socialLinks: value.socialLinks,
      headerNavigation: value.headerNavigation,
      footerNavigation: value.footerNavigation,
      demoNotice: value.demoNotice,
      notFound: { title: value.notFoundTitle, text: value.notFoundText },
      defaultSeo: value.defaultSeo,
    })
  );
