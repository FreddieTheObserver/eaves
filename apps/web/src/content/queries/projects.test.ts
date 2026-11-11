import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixture } from '../testing/fixtures';
import { getPublishedProject, getPublishedProjects } from './projects';

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

describe('project queries', () => {
  it('reads the recorded Project list into project cards', async () => {
    fetchMock.mockResolvedValueOnce(json(loadFixture('project-list')));

    const page = await getPublishedProjects();

    expect(page.items[0]?.slug).toBe('linden-house');
    expect(page.pagination.pageSize).toBe(25);
    expect(requestUrl(fetchMock.mock.calls[0]!).pathname).toBe('/api/projects');
  });

  it('sends the Typology and Service filters as nested Strapi filters', async () => {
    fetchMock.mockResolvedValueOnce(json(loadFixture('project-list')));

    await getPublishedProjects({ typology: 'residential', service: 'interiors' });

    const url = requestUrl(fetchMock.mock.calls[0]!);
    expect(url.searchParams.get('filters[typology][slug][$eq]')).toBe('residential');
    expect(url.searchParams.get('filters[services][slug][$eq]')).toBe('interiors');
  });

  it('reads one published Project by slug', async () => {
    fetchMock.mockResolvedValueOnce(json(loadFixture('project-published')));

    const project = await getPublishedProject('linden-house');

    expect(project?.slug).toBe('linden-house');
    expect(project?.services.length).toBeGreaterThan(0);
  });

  it('returns null when no published Project has the slug', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ data: [], meta: { pagination: { page: 1, pageSize: 25, pageCount: 0, total: 0 } } })
    );

    await expect(getPublishedProject('missing')).resolves.toBeNull();
  });
});
