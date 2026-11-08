import type { Core } from '@strapi/strapi';
import { previewPath } from '../src/preview';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Admin => {
  const webOrigin = new URL(env('WEB_URL')!).origin;
  const previewSecret = env('PREVIEW_SECRET')!;

  return {
    auth: {
      secret: env('ADMIN_JWT_SECRET')!,
    },
    apiToken: {
      salt: env('API_TOKEN_SALT')!,
    },
    transfer: {
      token: {
        salt: env('TRANSFER_TOKEN_SALT')!,
      },
    },
    secrets: {
      encryptionKey: env('ENCRYPTION_KEY')!,
    },
    flags: {
      nps: env.bool('FLAG_NPS', true),
      promoteEE: env.bool('FLAG_PROMOTE_EE', true),
      docLinks: env.bool('FLAG_DOC_LINKS', true),
    },
    preview: {
      enabled: true,
      config: {
        allowedOrigins: [webOrigin],
        async handler(uid, params) {
          const path = await previewPath(strapi, uid, params);
          if (!path) return null;

          const query = new URLSearchParams({ url: path, secret: previewSecret, status: params.status ?? 'draft' });
          return `${webOrigin}/api/preview?${query}`;
        },
      },
    },
  };
};

export default config;
