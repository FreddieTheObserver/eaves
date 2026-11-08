import { isIP } from 'node:net';
import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

const HEADER = 'x-visitor-ip';
const MAX_REQUESTS = 5;
const WINDOW_MS = 10 * 60 * 1000;
const SWEEP_MS = 60 * 1000;

type Window = { count: number; resetsAt: number };

// Inquiries arrive from the web app's server, so the request IP is the same for every visitor and the server action
// names the visitor in a header. Route middlewares run after token authentication, so only the Inquiry token reaches
// this. Addresses are personal data, so they stay in memory and are dropped within a minute of their window ending,
// even if no other Inquiry arrives.
const inquiryRateLimit: Core.MiddlewareFactory = () => {
  const windows = new Map<string, Window>();

  const forgetExpired = () => {
    const now = Date.now();
    for (const [key, { resetsAt }] of windows) {
      if (resetsAt <= now) windows.delete(key);
    }
  };
  setInterval(forgetExpired, SWEEP_MS).unref();

  return async (ctx, next) => {
    const ip = ctx.get(HEADER);
    if (isIP(ip) === 0) throw new errors.ValidationError(`The ${HEADER} header must hold the visitor's IP address.`);

    forgetExpired();
    const now = Date.now();
    const window = windows.get(ip) ?? { count: 0, resetsAt: now + WINDOW_MS };
    window.count += 1;
    windows.set(ip, window);

    if (window.count > MAX_REQUESTS) {
      ctx.set('Retry-After', String(Math.ceil((window.resetsAt - now) / 1000)));
      throw new errors.RateLimitError();
    }

    return next();
  };
};

export default inquiryRateLimit;
