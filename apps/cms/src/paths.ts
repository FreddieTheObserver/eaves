// The web app's routes from apps/web/src/content/rules.json, repeated because the CMS cannot import the web
// app at runtime. The behaviour check reads that file and fails when these drift from it.

const ROUTE_PREFIXES = {
  project: '/projects/',
  service: '/services/',
  article: '/journal/',
  page: '/',
} as const;

export type SluggedType = keyof typeof ROUTE_PREFIXES;

export const sluggedTypeOf = (uid: string): SluggedType | null => {
  const type = uid.split('.').pop() as string;
  return Object.hasOwn(ROUTE_PREFIXES, type) ? (type as SluggedType) : null;
};

export const pathOf = (type: SluggedType, slug: string): string => `${ROUTE_PREFIXES[type]}${slug}`;
