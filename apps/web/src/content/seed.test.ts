import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeDropped, parseContent } from './schemas';
import { published } from './testing/cases';

// Runs only from the CMS's pnpm check:seed, which loads the seed and passes its responses in this variable.
const responses = process.env.SEED_RESPONSES;

const names = [
  'project-list',
  'project-published',
  'service-list',
  'team-member-list',
  'typology-list',
  'topic-list',
  'article-list',
  'article-published',
  'page-published',
  'home-page-published',
  'studio-page-published',
  'site-settings-published',
];

describe.runIf(responses)('the seeded content', () => {
  it.each(names)('%s parses with nothing dropped', (name) => {
    const input: unknown = JSON.parse(readFileSync(join(responses as string, `${name}.json`), 'utf8'));
    const result = parseContent(published[name].strict, input);
    expect(result.ok ? [] : result.problems).toEqual([]);
    expect(result.dropped.map(describeDropped)).toEqual([]);
  });
});
