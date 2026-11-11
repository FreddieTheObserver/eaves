import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixture } from './testing/fixtures';
import { submitInquiry } from './inquiry';
import type { InquiryState } from './types';

const { headerStore } = vi.hoisted(() => ({ headerStore: { current: new Headers() } }));

vi.mock('next/headers', () => ({ headers: vi.fn(async () => headerStore.current) }));

const fetchMock = vi.fn();

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const requestUrl = (input: unknown): URL => {
  const request = input instanceof Request ? input : new Request(String(input));
  return new URL(request.url);
};

const form = (overrides: Record<string, string> = {}): FormData => {
  const data = new FormData();
  data.set('name', 'Visitor');
  data.set('email', 'visitor@example.com');
  data.set('kind', 'new_project');
  data.set('message', 'Hello, I would like to talk about a house.');
  data.set('consent', 'on');
  data.set('cf-turnstile-response', 'turnstile-token');
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return data;
};

const idle: InquiryState = { status: 'idle' };

beforeEach(() => {
  process.env.STRAPI_URL = 'http://localhost:1337';
  process.env.STRAPI_INQUIRY_TOKEN = 'inquiry-token';
  process.env.TURNSTILE_SECRET_KEY = 'turnstile-secret';
  headerStore.current = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Inquiry action', () => {
  it('verifies Turnstile and creates the Inquiry with the Inquiry token and first visitor IP', async () => {
    fetchMock.mockImplementation(async (input: unknown) =>
      requestUrl(input).host === 'challenges.cloudflare.com'
        ? json({ success: true })
        : json(loadFixture('inquiry-created'))
    );

    await expect(submitInquiry(idle, form())).resolves.toEqual({ status: 'sent' });

    const strapiCall = fetchMock.mock.calls.find(([input]) => requestUrl(input).pathname === '/api/inquiries');
    expect(strapiCall).toBeDefined();

    const request = strapiCall![0] as Request;
    expect(request.method).toBe('POST');
    expect(request.headers.get('authorization')).toBe('Bearer inquiry-token');
    expect(request.headers.get('x-visitor-ip')).toBe('203.0.113.7');
    await expect(request.json()).resolves.toEqual({
      data: {
        name: 'Visitor',
        email: 'visitor@example.com',
        kind: 'new_project',
        message: 'Hello, I would like to talk about a house.',
        consent: true,
      },
    });
  });

  it('falls back to a local IP when no forwarded address is present', async () => {
    headerStore.current = new Headers();
    fetchMock.mockImplementation(async (input: unknown) =>
      requestUrl(input).host === 'challenges.cloudflare.com'
        ? json({ success: true })
        : json(loadFixture('inquiry-created'))
    );

    await expect(submitInquiry(idle, form())).resolves.toEqual({ status: 'sent' });

    const request = fetchMock.mock.calls.find(([input]) => requestUrl(input).pathname === '/api/inquiries')![0] as Request;
    expect(request.headers.get('x-visitor-ip')).toBe('127.0.0.1');
  });

  it('rejects invalid input before calling Turnstile or Strapi', async () => {
    const state = await submitInquiry(idle, form({ name: '   ', email: 'not-an-email' }));

    expect(state.status).toBe('invalid');
    if (state.status !== 'invalid') throw new Error('expected invalid state');
    expect(state.errors.name?.length).toBeGreaterThan(0);
    expect(state.errors.email?.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires consent', async () => {
    const data = form();
    data.delete('consent');

    const state = await submitInquiry(idle, data);

    expect(state.status).toBe('invalid');
    if (state.status !== 'invalid') throw new Error('expected invalid state');
    expect(state.errors.consent?.length).toBeGreaterThan(0);
  });

  it('rejects a missing Turnstile token before verifying anything', async () => {
    const data = form();
    data.delete('cf-turnstile-response');

    const state = await submitInquiry(idle, data);

    expect(state.status).toBe('invalid');
    if (state.status !== 'invalid') throw new Error('expected invalid state');
    expect(state.errors.turnstile?.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not create the Inquiry when Turnstile fails', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: false }));

    const state = await submitInquiry(idle, form());

    expect(state.status).toBe('invalid');
    if (state.status !== 'invalid') throw new Error('expected invalid state');
    expect(state.errors.turnstile?.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports the CMS rate limit', async () => {
    fetchMock.mockImplementation(async (input: unknown) =>
      requestUrl(input).host === 'challenges.cloudflare.com'
        ? json({ success: true })
        : new Response(null, { status: 429 })
    );

    const state = await submitInquiry(idle, form());

    expect(state.status).toBe('failed');
    if (state.status !== 'failed') throw new Error('expected failed state');
    expect(state.message).toMatch(/Too many messages/);
  });

  it('reports a CMS failure without leaking the response', async () => {
    fetchMock.mockImplementation(async (input: unknown) =>
      requestUrl(input).host === 'challenges.cloudflare.com'
        ? json({ success: true })
        : new Response(null, { status: 500 })
    );

    const state = await submitInquiry(idle, form());

    expect(state).toEqual({
      status: 'failed',
      message: 'The Inquiry could not be sent. Please try again later.',
    });
  });

  describe('failures', () => {
    const isTurnstile = (input: unknown) => requestUrl(input).host === 'challenges.cloudflare.com';
    const logged = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.flat().map(String).join(' | ');

    it('logs why the CMS refused, without the visitor details', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      fetchMock.mockImplementation(async (input: unknown) =>
        isTurnstile(input) ? json({ success: true }) : new Response(null, { status: 403, statusText: 'Forbidden' })
      );

      const state = await submitInquiry(idle, form());

      expect(state.status).toBe('failed');
      expect(logged(errors)).toContain('HTTP 403 Forbidden');
      expect(logged(errors)).not.toContain('visitor@example.com');
      expect(logged(errors)).not.toContain('Hello, I would like');
      errors.mockRestore();
    });

    it('logs a missing Inquiry token instead of hiding it', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      delete process.env.STRAPI_INQUIRY_TOKEN;
      fetchMock.mockImplementation(async () => json({ success: true }));

      const state = await submitInquiry(idle, form());

      expect(state.status).toBe('failed');
      expect(logged(errors)).toContain('STRAPI_INQUIRY_TOKEN is not set');
      errors.mockRestore();
    });

    it('does not log a 429, which is the limit working', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      fetchMock.mockImplementation(async (input: unknown) =>
        isTurnstile(input) ? json({ success: true }) : new Response(null, { status: 429 })
      );

      await submitInquiry(idle, form());

      expect(errors).not.toHaveBeenCalled();
      errors.mockRestore();
    });

    it('logs a Turnstile outage and asks the visitor to try again', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      fetchMock.mockRejectedValue(new Error('network down'));

      const state = await submitInquiry(idle, form());

      expect(state.status).toBe('invalid');
      expect(logged(errors)).toContain('Turnstile verification failed: network down');
      errors.mockRestore();
    });

    it('does not log a Turnstile rejection, which is an ordinary bot', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      fetchMock.mockResolvedValueOnce(json({ success: false }));

      await submitInquiry(idle, form());

      expect(errors).not.toHaveBeenCalled();
      errors.mockRestore();
    });

    it('reports sent when the CMS stored the Inquiry but replied in an unexpected shape', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      fetchMock.mockImplementation(async (input: unknown) =>
        isTurnstile(input) ? json({ success: true }) : json({ unexpected: true }, 201)
      );

      await expect(submitInquiry(idle, form())).resolves.toEqual({ status: 'sent' });
      expect(logged(errors)).toContain('stored the Inquiry but its reply was not in the expected shape');
      errors.mockRestore();
    });
  });
});
