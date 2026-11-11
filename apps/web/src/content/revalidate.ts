import { CACHED_UIDS, UIDS } from './catalog';
import { documentTag, slugHistoryTag, typeTag } from './tags';

type ContentWebhook = {
  event: string;
  uid: string;
  entry?: { documentId?: string } | null;
};

type MediaWebhook = { event: string; media: unknown };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parse = (payload: unknown): ContentWebhook | MediaWebhook | null => {
  if (!isObject(payload) || typeof payload.event !== 'string' || payload.event === '') return null;

  if ('media' in payload) return { event: payload.event, media: payload.media };
  if (typeof payload.uid !== 'string' || payload.uid === '') return null;

  const entry = payload.entry;
  const documentId = isObject(entry) && typeof entry.documentId === 'string' ? entry.documentId : undefined;
  return { event: payload.event, uid: payload.uid, entry: documentId ? { documentId } : undefined };
};

const unique = (tags: string[]): string[] => [...new Set(tags)];

// Media changes can alter alt text used on any page, so they clear every cached type. A content change
// clears its type, its document, and the Slug history lookup when the change is a history row. Documents
// that show a relation carry that relation's document tag, so this also clears every page that shows it.
export const tagsForWebhook = (payload: unknown): string[] | null => {
  const webhook = parse(payload);
  if (!webhook) return null;

  if ('media' in webhook) return unique(CACHED_UIDS.map(typeTag));

  const tags = [typeTag(webhook.uid)];
  if (webhook.uid === UIDS.slugHistory) tags.push(slugHistoryTag);
  if (webhook.entry?.documentId) tags.push(documentTag(webhook.uid, webhook.entry.documentId));
  return unique(tags);
};
