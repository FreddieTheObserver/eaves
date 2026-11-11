import 'server-only';
import { timingSafeEqual } from 'node:crypto';

const matches = (expected: string, provided: string): boolean => {
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const secretMatches = (expected: string | undefined, provided: string | null): boolean => {
  if (!expected || !provided) return false;
  return matches(expected, provided);
};

export const bearerMatches = (expected: string | undefined, authorization: string | null): boolean =>
  secretMatches(expected, authorization?.startsWith('Bearer ') ? authorization.slice(7) : null);
