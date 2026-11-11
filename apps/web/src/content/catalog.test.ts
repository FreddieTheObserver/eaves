import { describe, expect, it } from 'vitest';
import { pathOf, sluggedTypeOfUid, UIDS } from './catalog';

describe('catalog', () => {
  it('builds the route for every slugged type', () => {
    expect(pathOf('project', 'linden-house')).toBe('/projects/linden-house');
    expect(pathOf('service', 'interiors')).toBe('/services/interiors');
    expect(pathOf('article', 'oak-and-light')).toBe('/journal/oak-and-light');
    expect(pathOf('page', 'privacy')).toBe('/privacy');
  });

  it('maps only the types that have a slug to a redirect type', () => {
    expect(sluggedTypeOfUid(UIDS.project)).toBe('project');
    expect(sluggedTypeOfUid(UIDS.article)).toBe('article');
    expect(sluggedTypeOfUid(UIDS.teamMember)).toBeNull();
    expect(sluggedTypeOfUid(UIDS.siteSettings)).toBeNull();
  });
});
