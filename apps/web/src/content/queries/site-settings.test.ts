import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixture } from '../testing/fixtures';
import { getPublishedSiteSettings } from './site-settings';

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

describe('site settings query', () => {
  it('reads the Site Settings single type', async () => {
    fetchMock.mockResolvedValueOnce(json(loadFixture('site-settings-published')));

    const settings = await getPublishedSiteSettings();

    expect(settings.contactEmail).toBe('hello@example.com');
    expect(settings.socialLinks.length).toBeGreaterThan(0);
    expect(settings.notFound.title).toBe('Page not found');
    expect(requestUrl(fetchMock.mock.calls[0]!).pathname).toBe('/api/site-settings');
  });
});
