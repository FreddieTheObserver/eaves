import type { Core } from '@strapi/strapi';
import { reconcileAccess } from './access';
import { registerPublishRules } from './publish-rules';

export default {
  register({ strapi }: { strapi: Core.Strapi }) {
    registerPublishRules(strapi);
  },

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await reconcileAccess(strapi);
  },
};
