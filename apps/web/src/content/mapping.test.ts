import { describe, expect, it } from 'vitest';
import populate from './populate.json';
import {
  articleCardSchema,
  collection,
  inquiryCreatedSchema,
  parseContent,
  projectDraftSchema,
  projectSchema,
  sectionsPageDraftSchema,
  sectionsPageSchema,
  single,
  siteSettingsSchema,
  slugHistorySchema,
} from './schemas';
import { published } from './testing/cases';
import { loadFixture, read } from './testing/fixtures';
import { valueOf } from './testing/parsed';

const strapiKeys = ['documentId', '__component', 'createdAt', 'updatedAt', 'publishedAt', 'alternativeText', 'formats', 'data', 'meta', 'attributes'];

const keysIn = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap(keysIn)
    : value && typeof value === 'object'
      ? Object.entries(value).flatMap(([key, child]) => [key, ...keysIn(child)])
      : [];

describe('domain types', () => {
  it.each(Object.entries(published))('%s leaves no Strapi key in what pages receive', (name, { strict }) => {
    const result = parseContent(strict, loadFixture(name));
    expect(result.dropped).toEqual([]);
    const leaked = keysIn(valueOf(result)).filter((key) => strapiKeys.includes(key));
    expect(leaked).toEqual([]);
  });

  it('reads a Project with the id, location and image the pages use', () => {
    const wire = read(loadFixture('project-published'), ['data', 0]) as Record<string, unknown>;
    const [project] = collection(projectSchema, 'Project').parse(loadFixture('project-published')).items;
    expect(project).toMatchObject({
      id: wire.documentId,
      locale: 'en',
      slug: 'linden-house',
      title: 'Linden House',
      location: { neighbourhood: 'Ari', city: 'Bangkok' },
      year: 2025,
      floorArea: 220,
      stage: 'completed',
      cover: { url: read(loadFixture('project-published'), ['data', 0, 'cover', 'url']), width: 1200, height: 800, alt: 'A sunlit living room with oak shelving' },
      typology: { name: 'Residential', slug: 'residential' },
      services: [{ name: 'Residential Interior Design', slug: 'residential-interior-design' }],
      credits: [
        { role: 'Lead designer', teamMember: { name: 'Designer One', position: 'Design Director' } },
        { role: 'Interior designer', teamMember: { name: 'Designer Two', position: 'Interior Designer' } },
      ],
      seo: { metaTitle: 'Linden House', shareImage: { width: 1200, height: 800 } },
    });
  });

  it('keeps the document id of everything a page shows indirectly, for cache tags', () => {
    const wire = read(loadFixture('project-published'), ['data', 0]) as Record<string, unknown>;
    const [project] = collection(projectSchema, 'Project').parse(loadFixture('project-published')).items;
    const typology = wire.typology as { documentId: string };
    const services = wire.services as { documentId: string }[];
    const credits = wire.credits as { teamMember: { documentId: string } }[];
    expect(project.typology.id).toBe(typology.documentId);
    expect(project.services.map((service) => service.id)).toEqual(services.map((service) => service.documentId));
    expect(project.credits.map((credit) => credit.teamMember.id)).toEqual(credits.map((credit) => credit.teamMember.documentId));
  });

  it('reads every kind of Block in the order it was written', () => {
    const [project] = collection(projectSchema, 'Project').parse(loadFixture('project-published')).items;
    expect(project.body.map((block) => block.type)).toEqual(['text', 'image', 'imagePair', 'gallery', 'quote', 'drawing']);
    expect(project.body[1]).toMatchObject({ type: 'image', caption: 'The terrace at noon', image: { alt: 'Deep eaves over a timber terrace' } });
    expect(project.body[4]).toMatchObject({ type: 'quote', text: 'Rooms should breathe.', speaker: { name: 'Designer One' } });
    expect(project.body[5]).toMatchObject({ type: 'drawing', kind: 'plan', caption: 'Ground floor plan' });
  });

  it('reads rich text with its marks, links and lists', () => {
    const [project] = collection(projectSchema, 'Project').parse(loadFixture('project-published')).items;
    const text = project.body[0];
    if (text.type !== 'text') throw new Error('expected a text Block');
    expect(text.body.map((node) => node.type)).toEqual(['heading', 'paragraph', 'list', 'list', 'quote', 'code']);
    expect(text.body[1]).toMatchObject({
      children: expect.arrayContaining([
        expect.objectContaining({ text: 'woven cane', bold: true }),
        expect.objectContaining({ type: 'link', url: 'https://example.com/materials' }),
      ]),
    });
  });

  it('turns an empty optional field into undefined rather than null', () => {
    const [project] = collection(projectSchema, 'Project').parse(loadFixture('project-published')).items;
    expect(project.body[2]).toMatchObject({ right: { caption: undefined } });
    expect(JSON.stringify(project)).not.toContain('null');
  });

  it('reads the Home page Sections in order with their Projects', () => {
    const home = single(sectionsPageSchema).parse(loadFixture('home-page-published'));
    expect(home.sections.map((section) => section.type)).toEqual([
      'statement',
      'selectedProjects',
      'servicesOverview',
      'latestArticles',
      'studioIntroduction',
      'team',
      'figures',
      'contactPrompt',
    ]);
    expect(home.sections[1]).toMatchObject({
      projects: [{ title: 'Linden House', stage: 'completed' }, { title: 'Mill Lane Cafe', stage: 'under_construction' }, { title: 'River Studio', stage: 'concept' }],
    });
    expect(home.sections[6]).toMatchObject({ items: [{ value: '12', label: 'Years in practice' }, { value: '40', label: 'Homes designed' }] });
  });

  it('reads a list with its pagination', () => {
    const articles = collection(articleCardSchema, 'Article').parse(loadFixture('article-list'));
    expect(articles.pagination).toEqual({ page: 1, pageSize: 12, pageCount: 1, total: 1 });
    expect(articles.items[0]).toMatchObject({ slug: 'oak-and-light', publicationDate: '2026-03-12', topic: { name: 'Material' } });
  });

  it('reads Site Settings with the not-found text grouped', () => {
    const settings = single(siteSettingsSchema).parse(loadFixture('site-settings-published'));
    expect(settings.notFound).toEqual({ title: 'Page not found', text: 'The page you are looking for does not exist.' });
    expect(settings.headerNavigation).toEqual([
      { label: 'Projects', href: '/projects' },
      { label: 'Journal', href: '/journal' },
    ]);
  });

  it('reads a Slug history entry with the id of its target', () => {
    const [entry] = collection(slugHistorySchema, 'Slug history entry').parse(loadFixture('slug-history-lookup')).items;
    const wire = read(loadFixture('slug-history-lookup'), ['data', 0]) as Record<string, unknown>;
    expect(entry).toEqual({ id: wire.documentId, oldPath: '/projects/old-linden', targetType: 'project', targetId: wire.targetDocumentId });
  });

  it('reads the id of a created Inquiry and nothing the visitor typed', () => {
    const created = inquiryCreatedSchema.parse(loadFixture('inquiry-created'));
    expect(Object.keys(created)).toEqual(['id']);
  });
});

describe('drafts', () => {
  it('reads a Project that has only a title', () => {
    const draft = single(projectDraftSchema).parse(loadFixture('project-draft'));
    expect(draft).toMatchObject({ title: 'Half-written project', services: [], credits: [], body: [], seo: {} });
    expect(draft.slug).toBeUndefined();
    expect(draft.cover).toBeUndefined();
    expect(draft.typology).toBeUndefined();
    expect(draft.year).toBeUndefined();
  });

  it('reads Sections with their required fields missing', () => {
    const draft = single(sectionsPageDraftSchema).parse(loadFixture('home-page-draft'));
    expect(draft.sections.map((section) => section.type)).toEqual(['statement', 'selectedProjects', 'contactPrompt']);
    expect(draft.sections[0]).toEqual({ type: 'statement', text: undefined, image: undefined });
    expect(draft.sections[1]).toMatchObject({ projects: [{ title: 'Linden House' }] });
  });

  it.each(Object.entries(published).filter(([, { lenient }]) => lenient))(
    '%s reads the same as published and as a draft once nothing is missing',
    (name, { strict, lenient }) => {
      expect(lenient?.parse(loadFixture(name))).toEqual(strict.parse(loadFixture(name)));
    }
  );
});

describe('populate.json', () => {
  it('asks for the same body of Blocks everywhere a body is shown', () => {
    expect(populate.service.body).toEqual(populate.project.body);
    expect(populate.article.body).toEqual(populate.project.body);
    expect(populate.page.body).toEqual(populate.project.body);
  });

  it('is the populate behind every recorded request', async () => {
    const requests = (await import('./fixtures/requests.json')).default as { populate?: string }[];
    const used = new Set(requests.flatMap((request) => (request.populate ? [request.populate] : [])));
    expect([...used].sort()).toEqual(Object.keys(populate).sort());
  });
});
