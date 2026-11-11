import { cacheTag } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UIDS } from '../catalog';
import { loadFixture } from '../testing/fixtures';
import { documentTag, slugHistoryTag, typeTag } from '../tags';
import { getSlugRedirect } from './slug-history';

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

const fetchMock = vi.fn();

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const requestUrl = (call: unknown[]): URL => {
  const [input] = call;
  return new URL(input instanceof Request ? input.url : String(input));
};

const targetResponse = (slug: string) => ({
  data: [{ documentId: 'projectLinden', slug }],
  meta: { pagination: { page: 1, pageSize: 1, pageCount: 1, total: 1 } },
});

const noTarget = {
  data: [],
  meta: { pagination: { page: 1, pageSize: 1, pageCount: 0, total: 0 } },
};

beforeEach(() => {
  process.env.STRAPI_URL = 'http://localhost:1337';
  process.env.STRAPI_READ_TOKEN = 'read-token';
  fetchMock.mockReset();
  vi.mocked(cacheTag).mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('slug redirects', () => {
  it('reads the history row and returns the current path when the target is published', async () => {
    fetchMock
      .mockResolvedValueOnce(json(loadFixture('slug-history-lookup')))
      .mockResolvedValueOnce(json(targetResponse('linden-house')));

    await expect(getSlugRedirect('/projects/old-linden')).resolves.toBe('/projects/linden-house');

    const historyUrl = requestUrl(fetchMock.mock.calls[0]!);
    expect(historyUrl.pathname).toBe('/api/slug-histories');
    expect(historyUrl.searchParams.get('filters[oldPath][$eq]')).toBe('/projects/old-linden');

    const targetUrl = requestUrl(fetchMock.mock.calls[1]!);
    expect(targetUrl.pathname).toBe('/api/projects');
    expect(targetUrl.searchParams.get('filters[documentId][$eq]')).toBe('projectLinden');
  });

  it('tags the lookup with the history and the target', async () => {
    fetchMock
      .mockResolvedValueOnce(json(loadFixture('slug-history-lookup')))
      .mockResolvedValueOnce(json(targetResponse('linden-house')));

    await getSlugRedirect('/projects/old-linden');

    expect(cacheTag).toHaveBeenCalledWith(slugHistoryTag);
    expect(cacheTag).toHaveBeenCalledWith(typeTag(UIDS.project));
    expect(cacheTag).toHaveBeenCalledWith(documentTag(UIDS.project, 'projectLinden'));
  });

  it('returns null when no history row matches', async () => {
    fetchMock.mockResolvedValueOnce(json(noTarget));

    await expect(getSlugRedirect('/projects/unknown')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null when the target is not published', async () => {
    fetchMock
      .mockResolvedValueOnce(json(loadFixture('slug-history-lookup')))
      .mockResolvedValueOnce(json(noTarget));

    await expect(getSlugRedirect('/projects/old-linden')).resolves.toBeNull();
  });

  it('ignores a trailing slash, query string and hash', async () => {
    fetchMock
      .mockResolvedValueOnce(json(loadFixture('slug-history-lookup')))
      .mockResolvedValueOnce(json(targetResponse('linden-house')));

    await getSlugRedirect('/projects/old-linden/?from=search#top');

    expect(requestUrl(fetchMock.mock.calls[0]!).searchParams.get('filters[oldPath][$eq]')).toBe(
      '/projects/old-linden'
    );
  });
});
