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

  for (const tag of tags) revalidateTag(tag, 'max');
  return NextResponse.json({ revalidated: tags });
}
