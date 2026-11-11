import { describe, expect, it } from 'vitest';
import { CACHED_UIDS, UIDS } from './catalog';
import { tagsForWebhook } from './revalidate';
import { documentTag, slugHistoryTag, typeTag } from './tags';

describe('webhook tags', () => {
  it('clears the type and document for a published Project', () => {
    const tags = tagsForWebhook({
      event: 'entry.publish',
      createdAt: '2026-01-01T00:00:00.000Z',
      model: 'project',
      uid: UIDS.project,
      entry: { id: 1, documentId: 'projectLinden' },
    });

    expect(tags).toEqual([typeTag(UIDS.project), documentTag(UIDS.project, 'projectLinden')]);
  });

  it('clears the whole type when a delete event has no document id', () => {
    const tags = tagsForWebhook({ event: 'entry.delete', uid: UIDS.project, entry: { id: 1 } });

    expect(tags).toEqual([typeTag(UIDS.project)]);
  });

  it('clears the Slug history lookup when a history row changes', () => {
    const tags = tagsForWebhook({
      event: 'entry.create',
      uid: UIDS.slugHistory,
      entry: { documentId: 'slugHistory' },
    });

    expect(tags).toContain(slugHistoryTag);
    expect(tags).toContain(documentTag(UIDS.slugHistory, 'slugHistory'));
  });

  it('clears every cached type for a media change', () => {
    const tags = tagsForWebhook({ event: 'media.update', createdAt: '2026-01-01T00:00:00.000Z', media: { id: 1 } });

    expect(tags).toEqual(CACHED_UIDS.map(typeTag));
  });

  it('rejects a payload it cannot recognise', () => {
    expect(tagsForWebhook(null)).toBeNull();
    expect(tagsForWebhook({})).toBeNull();
    expect(tagsForWebhook({ event: 'entry.publish' })).toBeNull();
    expect(tagsForWebhook({ event: '', uid: UIDS.project })).toBeNull();
  });
});
