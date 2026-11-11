import { revalidateTag } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UIDS } from '@/content/catalog';
import { documentTag, typeTag } from '@/content/tags';
import { POST } from './route';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

const call = (payload: unknown, secret = 'revalidate-secret') =>
  POST(
    new Request('http://localhost:3000/api/revalidate', {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    })
  );

beforeEach(() => {
  process.env.REVALIDATE_SECRET = 'revalidate-secret';
  vi.mocked(revalidateTag).mockClear();
});

afterEach(() => {
  delete process.env.REVALIDATE_SECRET;
});

describe('revalidation route', () => {
  it('rejects a request without the shared secret', async () => {
    const response = await POST(new Request('http://localhost:3000/api/revalidate', { method: 'POST' }));

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('rejects a request with the wrong secret', async () => {
    const response = await call({ event: 'entry.publish', uid: UIDS.project }, 'wrong');

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('clears the type and document tags for a content event', async () => {
    const response = await call({
      event: 'entry.publish',
      uid: UIDS.project,
      entry: { documentId: 'projectLinden' },
    });

    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith(typeTag(UIDS.project), { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith(documentTag(UIDS.project, 'projectLinden'), { expire: 0 });
    await expect(response.json()).resolves.toEqual({
      revalidated: [typeTag(UIDS.project), documentTag(UIDS.project, 'projectLinden')],
    });
  });

  it('tolerates a repeated delete event', async () => {
    const payload = { event: 'entry.delete', uid: UIDS.article, entry: { documentId: 'articleOak' } };

    await call(payload);
    await call(payload);

    expect(revalidateTag).toHaveBeenCalledTimes(4);
  });

  it('rejects a body that is not JSON', async () => {
    const response = await call('not json');

    expect(response.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('rejects a payload it cannot recognise', async () => {
    const response = await call({ event: 'entry.publish' });

    expect(response.status).toBe(400);
  });
});
