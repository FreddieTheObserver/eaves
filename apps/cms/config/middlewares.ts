import type { Core } from '@strapi/strapi';
import { CSP_DEFAULTS } from '@strapi/utils';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Middlewares => {
  const mediaOrigin = new URL(env('S3_PUBLIC_URL')!).origin;

  return [
    'strapi::logger',
    'strapi::errors',
    {
      name: 'strapi::security',
      config: {
        contentSecurityPolicy: {
          directives: {
            'img-src': [...CSP_DEFAULTS['img-src'], mediaOrigin],
            'media-src': [...CSP_DEFAULTS['media-src'], mediaOrigin],
          },
        },
      },
    },
    'strapi::cors',
    'strapi::poweredBy',
    'strapi::query',
    'strapi::body',
    'strapi::session',
    'strapi::favicon',
    'strapi::public',
  ];
};

export default config;
