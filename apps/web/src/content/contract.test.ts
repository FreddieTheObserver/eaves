import { describe, expect, it } from 'vitest';
import { drafts, published, silentDrops, violations } from './testing/cases';
import { fixtureFiles, fixtureNames, loadFixture } from './testing/fixtures';

const issuesOf = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  (result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message] as const);

describe('recorded Strapi responses', () => {
  it('has a test case for every recorded fixture and a fixture for every case', () => {
    const covered = [...Object.keys(published), ...Object.keys(drafts), ...Object.keys(violations), ...Object.keys(silentDrops)];
    expect([...covered].sort()).toEqual([...fixtureNames()].sort());
  });

  it('has no recorded file that requests.json does not list, and no listed request without a file', () => {
    expect([...fixtureFiles()].sort()).toEqual([...fixtureNames()].sort());
  });

  describe('published content', () => {
    it.each(Object.entries(published))('%s is read by its strict schema', (name, { strict }) => {
      const result = strict.safeParse(loadFixture(name));
      expect(issuesOf(result)).toEqual([]);
      expect(result.success).toBe(true);
    });

    it.each(Object.entries(published).filter(([, { lenient }]) => lenient))('%s is also read by its lenient schema', (name, { lenient }) => {
      expect(lenient?.safeParse(loadFixture(name)).success).toBe(true);
    });
  });

  describe('half-filled drafts', () => {
    it.each(Object.entries(drafts))('%s is read by its lenient schema', (name, { lenient }) => {
      const result = lenient.safeParse(loadFixture(name));
      expect(issuesOf(result)).toEqual([]);
      expect(result.success).toBe(true);
    });

    it.each(Object.entries(drafts))('%s is refused by its strict schema', (name, { strict }) => {
      expect(strict.safeParse(loadFixture(name)).success).toBe(false);
    });
  });

  describe('published documents that break a rule Strapi cannot enforce', () => {
    it.each(Object.entries(violations))('%s is refused for the right reasons', (name, { strict, issues }) => {
      const reported = issuesOf(strict.safeParse(loadFixture(name)));
      for (const [path, message] of issues) {
        expect(reported, `${path} should be reported`).toContainEqual([path, expect.stringContaining(message)]);
      }
      expect(reported).toHaveLength(issues.length);
    });

    it.each(Object.entries(violations))('%s is still readable as a draft', (name, { lenient }) => {
      expect(lenient.safeParse(loadFixture(name)).success).toBe(true);
    });
  });

  describe('responses that hide a problem', () => {
    // Strapi drops an unpublished Team Member from a published Byline, so one that remains looks complete.
    it.each(Object.entries(silentDrops))('%s passes with the people who are still published', (name, { strict }) => {
      expect(strict.safeParse(loadFixture(name)).success).toBe(true);
    });
  });
});
