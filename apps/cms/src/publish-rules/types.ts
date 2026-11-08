import type { Core } from '@strapi/strapi';

// A rule Strapi's schema cannot express. It looks at a draft that is about to be published and returns
// what is wrong with it, or an empty list.
export type PublishRule = {
  uids: string[];
  populate: (uid: string, strapi: Core.Strapi) => Record<string, unknown>;
  problems: (uid: string, draft: Record<string, unknown>, strapi: Core.Strapi) => string[] | Promise<string[]>;
};
