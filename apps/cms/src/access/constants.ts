import type { UID } from '@strapi/strapi';

const api = (name: string) => `api::${name}.${name}` as UID.ContentType;

export const TOKEN_NAMES = { read: 'Read', draft: 'Draft', inquiry: 'Inquiry' } as const;

export const ROLE_CODES = { editor: 'strapi-editor', author: 'strapi-author' } as const;

export const EDITORIAL_COLLECTIONS = ['service', 'team-member', 'project', 'article', 'page'].map(api);
export const SINGLES = ['home-page', 'studio-page', 'site-settings'].map(api);
export const REFERENCE_COLLECTIONS = ['typology', 'topic'].map(api);
export const SLUG_HISTORY = api('slug-history');
export const INQUIRY = api('inquiry');
export const ARTICLE = api('article');
export const AUTHOR_READABLE = ['team-member', 'topic', 'project'].map(api);
