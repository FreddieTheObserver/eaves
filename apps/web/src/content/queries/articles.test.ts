import { cacheTag } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { change, loadFixture } from '../testing/fixtures';
import { sortOf } from '../testing/url';
import { getPublishedArticle, getPublishedArticles } from './articles';

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
  vi.mocked(cacheTag).mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('article queries', () => {
  it('reads the recorded Article list into article cards', async () => {
    fetchMock.mockResolvedValueOnce(json(loadFixture('article-list')));

    const page = await getPublishedArticles();

    expect(page.items[0]?.slug).toBe('oak-and-light');
    expect(page.items[0]?.topic.slug).toBe('material');
    expect(requestUrl(fetchMock.mock.calls[0]!).pathname).toBe('/api/articles');
  });

  it('sends the default sort and page size', async () => {
    fetchMock.mockResolvedValueOnce(json(loadFixture('article-list')));

    await getPublishedArticles();

    const url = requestUrl(fetchMock.mock.calls[0]!);
    expect(sortOf(url)).toEqual(['publicationDate:desc', 'title:asc']);
    expect(url.searchParams.get('pagination[page]')).toBe('1');
    expect(url.searchParams.get('pagination[pageSize]')).toBe('12');
  });

  it('sends pagination and the Topic filter when asked', async () => {
    fetchMock.mockResolvedValueOnce(json(loadFixture('article-list')));

    await getPublishedArticles({ page: 2, pageSize: 5, topic: 'material' });

    const url = requestUrl(fetchMock.mock.calls[0]!);
    expect(url.searchParams.get('pagination[page]')).toBe('2');
    expect(url.searchParams.get('pagination[pageSize]')).toBe('5');
    expect(url.searchParams.get('filters[topic][slug][$eq]')).toBe('material');
  });

  it('reads one published Article by slug', async () => {
    fetchMock.mockResolvedValueOnce(json(loadFixture('article-published')));

    const article = await getPublishedArticle('oak-and-light');

    expect(article?.title).toBe('Oak and light');
    expect(article?.byline.length).toBeGreaterThan(0);
    expect(article?.body.length).toBeGreaterThan(0);
    expect(requestUrl(fetchMock.mock.calls[0]!).searchParams.get('filters[slug][$eq]')).toBe('oak-and-light');
  });

  it('tags a related Project that was dropped, so fixing it clears the Article', async () => {
    const broken = change(loadFixture('article-published'), ['data', 0, 'relatedProjects', 0, 'cover', 'alternativeText'], '');
    fetchMock.mockResolvedValueOnce(json(broken));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    const article = await getPublishedArticle('oak-and-light');

    expect(article?.relatedProjects).toHaveLength(0);
    expect(cacheTag).toHaveBeenCalledWith(expect.stringContaining('content:api::project.project:projectLinden'));
    errors.mockRestore();
  });

  it('returns null when no published Article has the slug', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ data: [], meta: { pagination: { page: 1, pageSize: 25, pageCount: 0, total: 0 } } })
    );

    await expect(getPublishedArticle('missing')).resolves.toBeNull();
  });
});
