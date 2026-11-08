import { describe, expect, it } from 'vitest';
import { collection, describeDropped, parseContent } from './schemas';
import { documents, drafts, itemDrops, published, refusals, silentDrops } from './testing/cases';
import { fixtureFiles, fixtureNames, loadFixture } from './testing/fixtures';
import { dropsOf } from './testing/parsed';

const issuesOf = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  (result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message] as const);

// What went wrong reading a response that should read cleanly: its problems, or else what it dropped.
const troubleOf = (result: ReturnType<typeof parseContent>) => (result.ok ? result.dropped.map(describeDropped) : result.problems);

describe('recorded Strapi responses', () => {
  it('has a test case for every recorded fixture and a fixture for every case', () => {
    const covered = [published, drafts, refusals, itemDrops, silentDrops].flatMap((cases) => Object.keys(cases));
    expect([...covered].sort()).toEqual([...fixtureNames()].sort());
  });

  it('has no recorded file that requests.json does not list, and no listed request without a file', () => {
    expect([...fixtureFiles()].sort()).toEqual([...fixtureNames()].sort());
  });

  describe('published content', () => {
    it.each(Object.entries(published))('%s is read by its strict schema with nothing dropped', (name, { strict }) => {
      const result = parseContent(strict, loadFixture(name));
      expect(troubleOf(result)).toEqual([]);
      expect(result.ok).toBe(true);
    });

    const withLenient = Object.entries(published).flatMap(([name, { lenient }]) => (lenient ? [[name, lenient] as const] : []));
    it.each(withLenient)('%s is also read by its lenient schema', (name, lenient) => {
      expect(troubleOf(parseContent(lenient, loadFixture(name)))).toEqual([]);
    });
  });

  describe('half-filled drafts', () => {
    it.each(Object.entries(drafts))('%s is read by its lenient schema', (name, { lenient }) => {
      const result = parseContent(lenient, loadFixture(name));
      expect(troubleOf(result)).toEqual([]);
      expect(result.ok).toBe(true);
    });

    it.each(Object.entries(drafts))('%s is refused by its strict schema, or loses what is unfinished', (name, { strict }) => {
      const result = parseContent(strict, loadFixture(name));
      expect(result.ok ? result.dropped : 'refused').not.toEqual([]);
    });
  });

  describe('published documents that break a rule Strapi cannot enforce', () => {
    it.each(Object.entries(refusals))('%s is refused for the right reasons', (name, { item, issues }) => {
      const reported = issuesOf(documents(item).safeParse(loadFixture(name)));
      for (const [path, message] of issues) {
        expect(reported, `${path} should be reported`).toContainEqual([`data.0.${path}`, expect.stringContaining(message)]);
      }
      expect(reported).toHaveLength(issues.length);
    });

    it.each(Object.entries(refusals))('%s is dropped from its list for the same reasons', (name, { item, what }) => {
      const refused = documents(item).safeParse(loadFixture(name)).error?.issues ?? [];
      const result = parseContent(collection(item, what), loadFixture(name));
      expect(result).toMatchObject({ ok: true, value: { items: [] } });
      expect(dropsOf(result)).toEqual([[`${what}[0]`, refused.map((issue) => `${issue.path.slice(2).join('.')}: ${issue.message}`)]]);
    });

    it.each(Object.entries(itemDrops))('%s loses only the broken item, and says which and why', (name, { strict, dropped, keeps }) => {
      const result = parseContent(strict, loadFixture(name));
      expect(result).toMatchObject({ ok: true, value: keeps });
      expect(dropsOf(result)).toEqual(dropped);
    });

    it.each([...Object.entries(refusals), ...Object.entries(itemDrops)])('%s is still readable as a draft', (name, { lenient }) => {
      expect(troubleOf(parseContent(lenient, loadFixture(name)))).toEqual([]);
    });
  });

  describe('responses that hide a problem', () => {
    // Strapi drops an unpublished Team Member from a published Byline, so one that remains looks complete.
    it.each(Object.entries(silentDrops))('%s passes with the people who are still published', (name, { strict }) => {
      expect(troubleOf(parseContent(strict, loadFixture(name)))).toEqual([]);
    });
  });
});
