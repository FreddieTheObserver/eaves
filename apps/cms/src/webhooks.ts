import type { Core } from '@strapi/strapi';
import { EDITORIAL_COLLECTIONS, REFERENCE_COLLECTIONS, SINGLES, SLUG_HISTORY } from './access/constants';

const WEBHOOK_NAME = 'Web app revalidation';

// Inquiry is left out on purpose: a webhook body carries the whole entry, so it would send visitors' names and
// emails to the web app. Listing events per type also stops a draft save from clearing published pages.
const contentTypeEvents = Object.fromEntries([
  ...[...EDITORIAL_COLLECTIONS, ...SINGLES].map((uid) => [uid, ['entry.publish', 'entry.unpublish', 'entry.delete']]),
  ...[...REFERENCE_COLLECTIONS, SLUG_HISTORY].map((uid) => [uid, ['entry.create', 'entry.update', 'entry.delete']]),
]);

type StoredWebhook = { id: string; name: string };

export const reconcileRevalidationWebhook = async (strapi: Core.Strapi) => {
  const store = strapi.get('webhookStore');
  const runner = strapi.get('webhookRunner');
  const stored: StoredWebhook[] = await store.findWebhooks();
  const existing = stored.find((webhook) => webhook.name === WEBHOOK_NAME);

  const url = process.env.REVALIDATE_URL;
  if (!url) {
    if (existing) {
      await store.deleteWebhook(existing.id);
      runner.remove(existing);
    }
    return;
  }

  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) throw new Error('REVALIDATE_SECRET is required when REVALIDATE_URL is set.');

  const webhook = {
    name: WEBHOOK_NAME,
    url,
    headers: { Authorization: `Bearer ${secret}` },
    events: ['media.create', 'media.update', 'media.delete'],
    contentTypeEvents,
    isEnabled: true,
  };

  // Strapi loads stored webhooks into the runner before this bootstrap runs, so the runner is told directly.
  if (existing) runner.update(await store.updateWebhook(existing.id, webhook));
  else runner.add(await store.createWebhook(webhook));
};
