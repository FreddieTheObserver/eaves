import { draftMode } from 'next/headers';
import { NextResponse } from 'next/server';
import { secretMatches } from '@/content/secrets';

const reject = (message: string, status: number): NextResponse => NextResponse.json({ error: message }, { status });

// The path comes from the CMS, but a crafted link must not send a preview to another origin.
const safePath = (raw: string | null): string | null => {
  if (!raw) return null;

  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return null;
  }

  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null;
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  return path;
};

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  if (!secretMatches(process.env.PREVIEW_SECRET, url.searchParams.get('secret'))) {
    return reject('Invalid preview secret', 401);
  }

  const status = url.searchParams.get('status');
  if (status !== 'draft' && status !== 'published') {
    return reject('status must be draft or published', 400);
  }

  const path = safePath(url.searchParams.get('url'));
  if (!path) return reject('url must be a path on this site', 400);

  const draft = await draftMode();
  if (status === 'draft') draft.enable();
  else draft.disable();

  return NextResponse.redirect(new URL(path, url.origin));
}
