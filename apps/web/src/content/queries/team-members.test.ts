import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixture } from '../testing/fixtures';
import { sortOf } from '../testing/url';
import { getPublishedTeamMembers } from './team-members';

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

describe('team member queries', () => {
  it('reads the recorded Team Member list in order', async () => {
    fetchMock.mockResolvedValueOnce(json(loadFixture('team-member-list')));

    const page = await getPublishedTeamMembers();

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items[0]?.portrait.alt.length).toBeGreaterThan(0);
    const [input] = fetchMock.mock.calls[0]!;
    const url = new URL(input instanceof Request ? input.url : String(input));
    expect(url.pathname).toBe('/api/team-members');
    expect(sortOf(url)).toEqual(['order:asc', 'name:asc']);
  });
});
