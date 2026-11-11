import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixture } from '../testing/fixtures';
import { getPublishedPage } from './pages';

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

beforeEach(() => {
  process.env.STRAPI_URL = 'http://localhost:1337';
  process.env.STRAPI_READ_TOKEN = 'read-token';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('page queries', () => {
  it('reads one published Page by slug', async () => {
    fetchMock.mockResolvedValueOnce(json(loadFixture('page-published')));

    const page = await getPublishedPage('privacy');

    expect(page?.title).toBe('Privacy');
    expect(page?.body.length).toBeGreaterThan(0);
    expect(requestUrl(fetchMock.mock.calls[0]!).pathname).toBe('/api/pages');
    expect(requestUrl(fetchMock.mock.calls[0]!).searchParams.get('filters[slug][$eq]')).toBe('privacy');
  });

  it('returns null when no published Page has the slug', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ data: [], meta: { pagination: { page: 1, pageSize: 25, pageCount: 0, total: 0 } } })
    );

    await expect(getPublishedPage('missing')).resolves.toBeNull();
  });
});
