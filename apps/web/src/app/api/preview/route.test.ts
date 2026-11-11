import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const { draft } = vi.hoisted(() => ({
  draft: { enable: vi.fn(), disable: vi.fn(), isEnabled: false },
}));

vi.mock('next/headers', () => ({ draftMode: vi.fn(async () => draft) }));

const preview = (params: Record<string, string>) => {
  const url = new URL('http://localhost:3000/api/preview');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return GET(new Request(url));
};

// The query string exactly as the CMS writes it, with the path percent-encoded once.
const previewQuery = (query: string) => GET(new Request(`http://localhost:3000/api/preview?${query}`));

beforeEach(() => {
  process.env.PREVIEW_SECRET = 'preview-secret';
  draft.enable.mockClear();
  draft.disable.mockClear();
});

afterEach(() => {
  delete process.env.PREVIEW_SECRET;
});

describe('preview route', () => {
  it('enables draft mode and redirects to the decoded path', async () => {
    const response = await preview({
      url: '/projects/linden-house?from=admin',
      secret: 'preview-secret',
      status: 'draft',
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/projects/linden-house?from=admin');
    expect(draft.enable).toHaveBeenCalledOnce();
    expect(draft.disable).not.toHaveBeenCalled();
  });

  it('disables draft mode when previewing the published version', async () => {
    const response = await preview({ url: '/journal/oak-and-light', secret: 'preview-secret', status: 'published' });

    expect(response.status).toBe(307);
    expect(draft.disable).toHaveBeenCalledOnce();
    expect(draft.enable).not.toHaveBeenCalled();
  });

  it('reads a path the CMS percent-encoded once', async () => {
    const response = await previewQuery('url=%2Fprojects%2Flinden-house&secret=preview-secret&status=draft');

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/projects/linden-house');
  });

  it('does not decode the path a second time', async () => {
    const encodedSlashes = await previewQuery('url=%252F%252Fevil.example&secret=preview-secret&status=draft');
    expect(encodedSlashes.status).toBe(400);

    const literalPercent = await previewQuery('url=%2Fprojects%2F100%2525&secret=preview-secret&status=draft');
    expect(literalPercent.status).toBe(307);
    expect(literalPercent.headers.get('location')).toBe('http://localhost:3000/projects/100%25');
  });

  it('rejects the wrong secret', async () => {
    const response = await preview({ url: '/', secret: 'wrong', status: 'draft' });

    expect(response.status).toBe(401);
    expect(draft.enable).not.toHaveBeenCalled();
  });

  it('rejects an unknown status', async () => {
    const response = await preview({ url: '/', secret: 'preview-secret', status: 'live' });

    expect(response.status).toBe(400);
  });

  it('rejects a path that leaves the site', async () => {
    for (const path of ['https://evil.example', '//evil.example', '/\\evil.example', '%2F%2Fevil.example']) {
      const response = await preview({ url: path, secret: 'preview-secret', status: 'draft' });
      expect(response.status).toBe(400);
    }
  });

  it('rejects a missing url', async () => {
    const response = await preview({ secret: 'preview-secret', status: 'draft' });

    expect(response.status).toBe(400);
  });
});
