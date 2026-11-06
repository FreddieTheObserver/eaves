import type { Core } from '@strapi/strapi';
import {
  EDITORIAL_COLLECTIONS,
  INQUIRY,
  REFERENCE_COLLECTIONS,
  SINGLES,
  SLUG_HISTORY,
  TOKEN_NAMES,
} from './constants';

const contentRead = [
  ...[...EDITORIAL_COLLECTIONS, ...REFERENCE_COLLECTIONS, SLUG_HISTORY].flatMap((uid) => [`${uid}.find`, `${uid}.findOne`]),
  ...SINGLES.map((uid) => `${uid}.find`),
];

// Read and Draft carry the same permissions: Strapi does not gate ?status=draft by permission,
// so the draft-gate policy is what keeps drafts away from every token except Draft.
const TOKENS = [
  { name: TOKEN_NAMES.read, description: 'Published content, for page renders.', permissions: contentRead },
  { name: TOKEN_NAMES.draft, description: 'Draft content, for draft mode only.', permissions: contentRead },
  { name: TOKEN_NAMES.inquiry, description: 'Creates Inquiries and nothing else.', permissions: [`${INQUIRY}.create`] },
];

// Strapi seeds these on a first boot with no users. Full Access can modify all content.
const SEEDED_TOKENS = [
  { name: 'Read Only', type: 'read-only' },
  { name: 'Full Access', type: 'full-access' },
];

export const reconcileApiTokens = async (strapi: Core.Strapi) => {
  const service = strapi.service('admin::api-token');

  for (const token of TOKENS) {
    const existing = await strapi.db.query('admin::api-token').findOne({ where: { name: token.name } });

    if (!existing) {
      await service.create({ ...token, type: 'custom', lifespan: null });
      // The key is shown in the admin under Settings, API Tokens; it is never logged.
      strapi.log.info(`API token "${token.name}" created. Copy its key from the admin panel.`);
      continue;
    }

    await service.update(existing.id, { description: token.description, type: 'custom', permissions: token.permissions });
  }

  // After the loop, so the token count never drops to zero and Strapi cannot seed them again.
  for (const { name, type } of SEEDED_TOKENS) {
    const seeded = await strapi.db.query('admin::api-token').findOne({ where: { name, type } });
    if (!seeded) continue;

    await service.revoke(seeded.id);
    strapi.log.info(`Removed the default API token "${name}".`);
  }
};
