import { z } from 'zod';
import type { InquiryInput } from '../types';
import { requiredText } from './shared';

// Inquiries are write-only (the Read token gets a 404), so this validates what a visitor sends rather than
// something Strapi returns. It repeats every limit Strapi has on the Inquiry type (an email column holds 255
// characters), because visitor input is checked here before it reaches the CMS. The consent rule is the one Strapi cannot enforce: a required
// boolean accepts false.
export const inquiryInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(255),
  kind: z.enum(['new_project', 'press', 'other']),
  message: z.string().trim().min(1).max(5000),
  consent: z.literal(true, { error: 'Consent is required to send an Inquiry' }),
}) satisfies z.ZodType<InquiryInput, unknown>;

export const inquiryCreatedSchema = z
  .object({ data: z.object({ documentId: requiredText }) })
  .transform((response) => ({ id: response.data.documentId }));
