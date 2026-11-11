import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixture } from '../testing/fixtures';
import { getPublishedHomePage, getPublishedStudioPage } from './sections-pages';

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

describe('sections page queries', () => {
  it('reads the Home Page single type', async () => {
    fetchMock.mockResolvedValueOnce(json(loadFixture('home-page-published')));

    const page = await getPublishedHomePage();

    expect(page.sections.length).toBeGreaterThan(0);
    expect(page.seo.metaTitle).toBeTruthy();
    expect(requestUrl(fetchMock.mock.calls[0]!).pathname).toBe('/api/home-page');
  });

  it('reads the Studio Page single type', async () => {
    fetchMock.mockResolvedValueOnce(json(loadFixture('studio-page-published')));

    const page = await getPublishedStudioPage();

    expect(page.sections.length).toBeGreaterThan(0);
    expect(requestUrl(fetchMock.mock.calls[0]!).pathname).toBe('/api/studio-page');
  });
});
