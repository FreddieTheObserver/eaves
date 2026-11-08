import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { collectDropped, describeDropped, parseContent, tolerantList } from './schemas/tolerance';

const tag = z.object({ name: z.string().trim().min(1, 'A Tag needs a name').max(12, 'A Tag name is too long'), colour: z.enum(['red', 'blue']) });
const item = z.discriminatedUnion('__component', [
  z.object({ __component: z.literal('item.book'), title: z.string().min(1, 'A Book needs a title') }),
  z.object({ __component: z.literal('item.plant'), species: z.string() }),
]);
const shelf = z.object({
  documentId: z.string(),
  owner: z.object({ name: z.string() }, { error: 'A Shelf needs an owner' }),
  tags: tolerantList('Tag', tag).refine((tags) => tags.length >= 2, 'A Shelf needs two Tags'),
  items: tolerantList('Item', item),
});
const shelves = z.object({ data: tolerantList('Shelf', shelf) });

const goodTag = (name: string) => ({ name, colour: 'red' });
const goodShelf = (documentId: string, changes: Record<string, unknown> = {}) => ({
  documentId,
  owner: { name: 'Owner' },
  tags: [goodTag('oak'), goodTag('cane')],
  items: [{ __component: 'item.book', title: 'Rooms' }],
  ...changes,
});
const withoutOwner = (documentId: string) => {
  const value: Record<string, unknown> = goodShelf(documentId);
  delete value.owner;
  return value;
};
const shelf0 = { what: 'Shelf', index: 0, id: 'one' };

describe('tolerant lists', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps every item and drops nothing when nothing is broken', () => {
    const input = { data: [goodShelf('one'), goodShelf('two')] };
    expect(parseContent(shelves, input)).toEqual({ ok: true, value: input, dropped: [] });
  });

  it.each([
    ['empty text', '  ', 'name: A Tag needs a name'],
    ['text that is too long', 'reclaimed teak', 'name: A Tag name is too long'],
  ])('drops an item with %s and says where it was and why', (_, name, why) => {
    const tags = [goodTag('oak'), goodTag(name), goodTag('cane')];
    const result = parseContent(shelves, { data: [goodShelf('one', { tags })] });
    expect(result.ok && result.value.data[0].tags.map((kept) => kept.name)).toEqual(['oak', 'cane']);
    expect(result.dropped).toEqual([{ path: [shelf0, { what: 'Tag', index: 1 }], reasons: [why], causes: [] }]);
  });

  it('drops a whole document when a required relation is null, and keeps the others', () => {
    const result = parseContent(shelves, { data: [goodShelf('one', { owner: null }), goodShelf('two')] });
    expect(result.ok && result.value.data.map((kept) => kept.documentId)).toEqual(['two']);
    expect(result.dropped).toEqual([{ path: [shelf0], reasons: ['owner: A Shelf needs an owner'], causes: [] }]);
  });

  it('names a dropped component by its component name', () => {
    const result = parseContent(shelves, { data: [goodShelf('one', { items: [{ __component: 'item.book', title: '' }] })] });
    expect(result.ok && result.value.data[0].items).toEqual([]);
    expect(result.dropped[0].path).toEqual([shelf0, { what: 'Item', index: 0, id: 'item.book' }]);
  });

  it('counts a list after its broken items are dropped, and keeps those items as the cause', () => {
    const result = parseContent(shelves, { data: [goodShelf('one', { tags: [goodTag('oak'), goodTag('')] }), goodShelf('two')] });
    expect(result.ok && result.value.data.map((kept) => kept.documentId)).toEqual(['two']);
    expect(result.dropped).toEqual([
      {
        path: [shelf0],
        reasons: ['tags: A Shelf needs two Tags'],
        causes: [{ path: [shelf0, { what: 'Tag', index: 1 }], reasons: ['name: A Tag needs a name'], causes: [] }],
      },
    ]);
  });

  it('describes a drop in one line, with what was dropped before it', () => {
    const result = parseContent(shelves, { data: [goodShelf('one', { tags: [goodTag('oak'), goodTag('')] })] });
    expect(result.dropped.map(describeDropped)).toEqual([
      'Shelf[0] (one): tags: A Shelf needs two Tags (after dropping Shelf[0] (one) > Tag[1]: name: A Tag needs a name)',
    ]);
  });
});

describe('what is never dropped', () => {
  it('fails the whole response when a key is missing, because the query did not ask for it', () => {
    expect(parseContent(shelves, { data: [withoutOwner('one'), goodShelf('two')] })).toEqual({
      ok: false,
      problems: ['data.0.owner: A Shelf needs an owner'],
      dropped: [],
    });
  });

  it('fails the whole response from a missing key however deep it is', () => {
    const result = parseContent(shelves, { data: [goodShelf('one', { tags: [goodTag('oak'), { colour: 'red' }, goodTag('cane')] })] });
    expect(result).toMatchObject({ ok: false, problems: [expect.stringMatching(/^data\.0\.tags\.1\.name: /)] });
  });

  it.each([
    ['a value of the wrong type', { name: 5, colour: 'red' }, 'data.0.tags.0.name'],
    ['an option the web app does not know', { name: 'oak', colour: 'green' }, 'data.0.tags.0.colour'],
    ['content and query problems together', { name: '', colour: 'green' }, 'data.0.tags.0'],
  ])('fails the whole response on %s', (_, broken, path) => {
    const result = parseContent(shelves, { data: [goodShelf('one', { tags: [broken, goodTag('oak'), goodTag('cane')] })] });
    expect(result.ok).toBe(false);
    expect(result.ok || result.problems.every((problem) => problem.startsWith(path))).toBe(true);
  });

  it('fails the whole response on a component the web app does not know', () => {
    const result = parseContent(shelves, { data: [goodShelf('one', { items: [{ __component: 'item.lamp' }] })] });
    expect(result).toMatchObject({ ok: false, problems: [expect.stringMatching(/^data\.0\.items\.0\.__component: /)] });
  });

  it('keeps what was dropped before the response failed, inside and outside the broken item', () => {
    const broken = { ...withoutOwner('two'), tags: [goodTag(''), goodTag('oak'), goodTag('cane')] };
    const result = parseContent(shelves, { data: [goodShelf('one', { owner: null }), broken] });
    expect(result.ok).toBe(false);
    expect(result.dropped.map((drop) => drop.path)).toEqual([[shelf0], [{ what: 'Shelf', index: 1, id: 'two' }, { what: 'Tag', index: 0 }]]);
  });

  it('returns problems instead of throwing on a response that is not content at all', () => {
    expect(parseContent(shelves, 'not a response')).toMatchObject({ ok: false, problems: [expect.any(String)] });
    expect(parseContent(shelves, { data: null })).toMatchObject({ ok: false });
  });
});

describe('collecting drops', () => {
  const broken = { data: [goodShelf('one', { owner: null })] };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports to the console when nothing collects, so a drop is never silent', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(shelves.parse(broken)).toEqual({ data: [] });
    expect(error).toHaveBeenCalledExactlyOnceWith('Dropped Shelf[0] (one): owner: A Shelf needs an owner');
  });

  it('keeps an inner collection to itself and hands control back to the outer one', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const outer = collectDropped(() => {
      const inner = collectDropped(() => shelves.parse(broken));
      expect(inner.dropped).toHaveLength(1);
      shelves.parse(broken);
    });
    expect(outer.dropped).toHaveLength(1);
    expect(error).not.toHaveBeenCalled();
    shelves.parse(broken);
    expect(error).toHaveBeenCalledOnce();
  });

  it('refuses asynchronous work, whose drops would land in the wrong collection', () => {
    expect(() => collectDropped(async () => shelves.parse(broken))).toThrow('asynchronous');
  });
});
