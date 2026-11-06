import { factories } from '@strapi/strapi';
import type { UID } from '@strapi/strapi';

const policies = ['global::draft-gate'];

export const createGatedRouter = (uid: UID.ContentType, kind: 'collection' | 'single') =>
  factories.createCoreRouter(uid, {
    config: kind === 'single' ? { find: { policies } } : { find: { policies }, findOne: { policies } },
  });
