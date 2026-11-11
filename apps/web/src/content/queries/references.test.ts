import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixture } from '../testing/fixtures';
import { getTopics, getTypologies } from './references';

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

const fetchMock = vi.fn();

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  process.env.STRAPI_URL = 'http://localhost:1337';
  process.env.STRAPI_READ_TOKEN = 'read-token';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reference queries', () => {
  it('reads Typologies', async () => {
    fetchMock.mockResolvedValueOnce(json(loadFixture('typology-list')));

    const page = await getTypologies();

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items[0]?.slug).toBeTruthy();
  });

  it('reads Topics', async () => {
    fetchMock.mockResolvedValueOnce(json(loadFixture('topic-list')));

    const page = await getTopics();

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items[0]?.name).toBeTruthy();
  });
});
