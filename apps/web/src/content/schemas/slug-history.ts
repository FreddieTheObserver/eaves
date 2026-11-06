import { z } from 'zod';
import type { SlugHistoryEntry } from '../types';
import { requiredText } from './shared';

export const slugHistorySchema = z
  .object({
    documentId: requiredText,
    oldPath: requiredText,
    targetType: z.enum(['project', 'article', 'service', 'page']),
    targetDocumentId: requiredText,
  })
  .transform(
    (value): SlugHistoryEntry => ({
      id: value.documentId,
      oldPath: value.oldPath,
      targetType: value.targetType,
      targetId: value.targetDocumentId,
    })
  );
