import { describe, expect, it } from 'vitest';
import { bearerMatches, secretMatches } from './secrets';

describe('secret checks', () => {
  it('accepts only the exact secret', () => {
    expect(secretMatches('secret', 'secret')).toBe(true);
    expect(secretMatches('secret', 'Secret')).toBe(false);
    expect(secretMatches('secret', 'secret ')).toBe(false);
  });

  it('rejects a missing configured or provided secret', () => {
    expect(secretMatches(undefined, 'secret')).toBe(false);
    expect(secretMatches('secret', null)).toBe(false);
    expect(secretMatches('', '')).toBe(false);
  });

  it('reads a bearer authorization header', () => {
    expect(bearerMatches('secret', 'Bearer secret')).toBe(true);
    expect(bearerMatches('secret', 'secret')).toBe(false);
    expect(bearerMatches('secret', 'Bearer other')).toBe(false);
    expect(bearerMatches(undefined, 'Bearer secret')).toBe(false);
  });
});
