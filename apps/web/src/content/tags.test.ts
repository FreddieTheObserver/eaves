import { describe, expect, it } from 'vitest';
import { UIDS } from './catalog';
import { articleSchema, collection, pageSchema, parseContent, projectSchema, serviceSchema, type Dropped } from './schemas';
import {
  articleCacheTags,
  documentTag,
  droppedCacheTags,
  listCacheTags,
  pageCacheTags,
  projectCacheTags,
  serviceCacheTags,
  typeTag,
} from './tags';
import { loadFixture } from './testing/fixtures';
import { valueOf } from './testing/parsed';
import type { Article, Block, Page, Service } from './types';

const firstOf = (schema: Parameters<typeof collection>[0], name: string) =>
  valueOf(parseContent(collection(schema, 'Document'), loadFixture(name))).items[0];

const project = valueOf(parseContent(collection(projectSchema, 'Project'), loadFixture('project-published'))).items[0];
const article = firstOf(articleSchema, 'article-published') as Article;
const service = firstOf(serviceSchema, 'service-list') as Service;
const page = firstOf(pageSchema, 'page-published') as Page;

const quote: Block = { type: 'quote', text: 'Words', speaker: { id: 'speakerOne', name: 'Sirin', position: 'Designer' } };
const speakerTag = documentTag(UIDS.teamMember, 'speakerOne');

describe('cache tags', () => {
  it('tags a Project with its own document and every document it displays', () => {
    const tags = projectCacheTags(project);
    expect(tags).toContain(documentTag(UIDS.project, project.id));
    expect(tags).toContain(documentTag(UIDS.typology, project.typology.id));
    for (const service of project.services) expect(tags).toContain(documentTag(UIDS.service, service.id));
    for (const credit of project.credits) expect(tags).toContain(documentTag(UIDS.teamMember, credit.teamMember.id));
  });

  it('adds the content type tag to a list', () => {
    expect(listCacheTags(UIDS.project, [project], projectCacheTags)).toContain(typeTag(UIDS.project));
  });

  it('tags the Team Member a recorded Quote names', () => {
    const speakers = project.body.flatMap((block) => (block.type === 'quote' && block.speaker ? [block.speaker.id] : []));

    expect(speakers.length).toBeGreaterThan(0);
    for (const id of speakers) expect(projectCacheTags(project)).toContain(documentTag(UIDS.teamMember, id));
  });

  it('tags a Quote speaker on every type that has a body', () => {
    expect(projectCacheTags({ ...project, body: [quote] })).toContain(speakerTag);
    expect(articleCacheTags({ ...article, body: [quote] })).toContain(speakerTag);
    expect(serviceCacheTags({ ...service, body: [quote] })).toContain(speakerTag);
    expect(pageCacheTags({ ...page, body: [quote] })).toContain(speakerTag);
  });

  it('adds no Team Member tag for a Quote with no speaker', () => {
    const anonymous: Block = { type: 'quote', text: 'Words' };

    expect(pageCacheTags({ ...page, body: [anonymous] })).toEqual([documentTag(UIDS.page, page.id)]);
  });
});

describe('tags for dropped documents', () => {
  const place = (what: string, index: number, id?: string) => ({ what, index, ...(id ? { id } : {}) });

  it('names a related Project that was dropped', () => {
    const dropped: Dropped[] = [{ path: [place('Related Project', 0, 'projectOak')], reasons: ['cover: Alternative text is required'], causes: [] }];

    expect(droppedCacheTags(dropped)).toEqual([documentTag(UIDS.project, 'projectOak')]);
  });

  it('names the card that made a Selected Projects Section fall below its minimum', () => {
    const dropped: Dropped[] = [
      {
        path: [place('Section', 1, 'sections.selected-projects')],
        reasons: ['projects: Selected Projects needs three to six Projects'],
        causes: [{ path: [place('Section', 1, 'sections.selected-projects'), place('Project card', 2, 'projectOak')], reasons: [], causes: [] }],
      },
    ];

    expect(droppedCacheTags(dropped)).toEqual([documentTag(UIDS.project, 'projectOak')]);
  });

  it('adds nothing for an item that is not a document', () => {
    const dropped: Dropped[] = [
      { path: [place('Credit', 0, 'shared.credit')], reasons: [], causes: [] },
      { path: [place('Block', 3, 'blocks.quote')], reasons: [], causes: [] },
    ];

    expect(droppedCacheTags(dropped)).toEqual([]);
  });
});
