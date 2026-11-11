// The sort a query sent, in order: the Strapi client writes a list as sort[0], sort[1] and so on.
export const sortOf = (url: URL): string[] =>
  [...url.searchParams].filter(([key]) => key.startsWith('sort')).map(([, value]) => value);
