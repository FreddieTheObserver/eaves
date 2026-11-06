import type { Core } from '@strapi/strapi';
import { reconcileAccess } from './access';

export default {
  register() {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await reconcileAccess(strapi);
  },
};
