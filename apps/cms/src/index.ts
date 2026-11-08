import type { Core } from '@strapi/strapi';
import { reconcileAccess } from './access';
import { registerPublishRules } from './publish-rules';
import { reconcileRevalidationWebhook } from './webhooks';
import { registerSlugHistory } from './slug-history';

export default {
  register({ strapi }: { strapi: Core.Strapi }) {
    registerPublishRules(strapi);
    registerSlugHistory(strapi);
  },

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await reconcileAccess(strapi);
    await reconcileRevalidationWebhook(strapi);
  },
};
