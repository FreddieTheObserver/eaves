'use server';

import { HTTPError } from '@strapi/client';
import { isIP } from 'node:net';
import { headers } from 'next/headers';
import { z } from 'zod';
import { RESOURCES } from './catalog';
import { inquiryClient } from './client';
import { inquiryCreatedSchema, inquiryInputSchema } from './schemas';
import type { InquiryState } from './types';

const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const LOCAL_IP = '127.0.0.1';

const turnstileResponse = z.object({ success: z.boolean() });

// Vercel sets x-forwarded-for to the visitor first. Local development has no forwarded address, so the
// fallback keeps the CMS rate limit working, at the cost of every local submission sharing one window.
const visitorIp = async (): Promise<string> => {
  const forwarded = (await headers()).get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first && isIP(first) !== 0 ? first : LOCAL_IP;
};

const verifyTurnstile = async (token: string, ip: string): Promise<boolean> => {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error('[inquiry] TURNSTILE_SECRET_KEY is not set');
    return false;
  }

  try {
    const response = await fetch(TURNSTILE_URL, {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      cache: 'no-store',
    });
    if (!response.ok) return false;

    const result = turnstileResponse.safeParse(await response.json());
    return result.success && result.data.success;
  } catch {
    return false;
  }
};

const fieldErrors = (error: z.ZodError): Record<string, string[]> => {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path[0] === undefined ? 'form' : String(issue.path[0]);
    (errors[field] ??= []).push(issue.message);
  }
  return errors;
};

export async function submitInquiry(_previous: InquiryState, formData: FormData): Promise<InquiryState> {
  const token = formData.get('cf-turnstile-response');
  if (typeof token !== 'string' || token.trim() === '') {
    return { status: 'invalid', errors: { turnstile: ['Please complete the challenge'] } };
  }

  const result = inquiryInputSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    kind: formData.get('kind'),
    message: formData.get('message'),
    consent: formData.get('consent') === 'on' || formData.get('consent') === 'true',
  });
  if (!result.success) return { status: 'invalid', errors: fieldErrors(result.error) };

  const ip = await visitorIp();
  if (!(await verifyTurnstile(token, ip))) {
    return { status: 'invalid', errors: { turnstile: ['The challenge could not be verified. Please try again.'] } };
  }

  try {
    const response = await inquiryClient(ip).collection(RESOURCES.inquiry).create(result.data);
    inquiryCreatedSchema.parse(response);
    return { status: 'sent' };
  } catch (error) {
    if (error instanceof HTTPError && error.response.status === 429) {
      return { status: 'failed', message: 'Too many messages from this connection. Please try again later.' };
    }
    return { status: 'failed', message: 'The Inquiry could not be sent. Please try again later.' };
  }
}
