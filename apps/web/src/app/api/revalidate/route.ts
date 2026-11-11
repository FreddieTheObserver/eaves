import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { tagsForWebhook } from '@/content/revalidate';
import { bearerMatches } from '@/content/secrets';

export async function POST(request: Request): Promise<NextResponse> {
  if (!bearerMatches(process.env.REVALIDATE_SECRET, request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'The body must be JSON' }, { status: 400 });
  }

  const tags = tagsForWebhook(payload);
  if (!tags) return NextResponse.json({ error: 'The webhook payload is not recognised' }, { status: 400 });

  // A webhook cannot call updateTag, and the Editor who just published expects the next visit to show it, so
  // stale content is never served. The 'max' profile would serve the old page once more.
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return NextResponse.json({ revalidated: tags });
}
