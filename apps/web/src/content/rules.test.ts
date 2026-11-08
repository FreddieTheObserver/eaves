import { describe, expect, it } from 'vitest';
import {
  RESERVED_PAGE_SLUGS,
  articleSchema,
  collection,
  inquiryInputSchema,
  pageDraftSchema,
  pageSchema,
  parseContent,
  projectCardSchema,
  projectDraftSchema,
  projectSchema,
  sectionsPageDraftSchema,
  sectionsPageSchema,
  single,
  siteSettingsSchema,
} from './schemas';
import { documents } from './testing/cases';
import { change, loadFixture, read } from './testing/fixtures';
import { dropsOf, valueOf, where } from './testing/parsed';

const projects = collection(projectSchema, 'Project');
const articles = collection(articleSchema, 'Article');
const pages = collection(pageSchema, 'Page');
const sectionsPage = single(sectionsPageSchema);
const messages = (result: { error?: { issues: { message: string }[] } }) => (result.error?.issues ?? []).map((issue) => issue.message);

describe('required relations', () => {
  const project = loadFixture('project-published');

  it('refuses a Project with no Typology', () => {
    const result = documents(projectSchema).safeParse(change(project, ['data', 0, 'typology'], null));
    expect(messages(result)).toEqual(['A Project must have a Typology']);
  });

  it('refuses a Project with no Services', () => {
    const result = documents(projectSchema).safeParse(change(project, ['data', 0, 'services'], []));
    expect(messages(result)).toEqual(['A Project must have at least one Service']);
  });

  it('drops a refused Project from its list and keeps the others', () => {
    const list = loadFixture('project-list');
    const result = parseContent(collection(projectCardSchema, 'Project'), change(list, ['data', 1, 'typology'], null));
    expect(valueOf(result).items.map((card) => card.slug)).toEqual(['linden-house', 'river-studio']);
    expect(dropsOf(result)).toEqual([['Project[1]', ['typology: A Project must have a Typology']]]);
    expect(result.dropped[0].path[0].id).toBe('projectMill');
  });

  it('drops a Credit that names no Team Member and keeps the Project', () => {
    const result = parseContent(projects, change(project, ['data', 0, 'credits', 1, 'teamMember'], null));
    expect(valueOf(result).items[0].credits.map((credit) => credit.role)).toEqual(['Lead designer']);
    expect(dropsOf(result)).toEqual([['Project[0] > Credit[1]', ['teamMember: A Credit must name a Team Member']]]);
  });

  it('accepts a Project with no Credits and a Quote with no speaker', () => {
    const bare = change(change(project, ['data', 0, 'credits'], []), ['data', 0, 'body', 4, 'speaker'], null);
    expect(parseContent(projects, bare)).toMatchObject({ ok: true, dropped: [] });
  });

  it('refuses an Article with no Topic or no Byline', () => {
    const article = loadFixture('article-published');
    const strict = documents(articleSchema);
    expect(messages(strict.safeParse(change(article, ['data', 0, 'topic'], null)))).toEqual(['An Article must have a Topic']);
    expect(messages(strict.safeParse(change(article, ['data', 0, 'byline'], [])))).toEqual([
      'An Article must name at least one Team Member in its Byline',
    ]);
  });

  it('accepts an Article with no related Projects', () => {
    const result = parseContent(articles, change(loadFixture('article-published'), ['data', 0, 'relatedProjects'], []));
    expect(result).toMatchObject({ ok: true, dropped: [] });
  });

  it('drops a related Project that breaks a rule and keeps the Article', () => {
    const article = loadFixture('article-published');
    const result = parseContent(articles, change(article, ['data', 0, 'relatedProjects', 0, 'cover', 'alternativeText'], null));
    expect(valueOf(result).items[0]).toMatchObject({ slug: 'oak-and-light', relatedProjects: [] });
    expect(dropsOf(result)).toEqual([['Article[0] > Related Project[0]', ['cover.alternativeText: Alternative text is required']]]);
  });

  it('fails when a populate is missing, so a wrong query cannot pass as empty content', () => {
    const withoutTypology = structuredClone(project) as { data: Record<string, unknown>[] };
    delete withoutTypology.data[0].typology;
    expect(parseContent(projects, withoutTypology)).toMatchObject({ ok: false, problems: ['data.0.typology: A Project must have a Typology'] });
  });

  it('fails when a populate inside a Credit is missing, rather than dropping every Credit', () => {
    const withoutMember = structuredClone(project) as { data: { credits: Record<string, unknown>[] }[] };
    delete withoutMember.data[0].credits[0].teamMember;
    expect(parseContent(projects, withoutMember)).toMatchObject({ ok: false, problems: ['data.0.credits.0.teamMember: A Credit must name a Team Member'] });
  });
});

describe('consent', () => {
  const valid = { name: 'Visitor', email: 'visitor@example.com', kind: 'new_project', message: 'Hello', consent: true };

  it('accepts an Inquiry with consent', () => {
    expect(inquiryInputSchema.parse(valid)).toEqual(valid);
  });

  it.each([false, undefined, null, 'true', 1, 'on'])('refuses consent of %s', (consent) => {
    const result = inquiryInputSchema.safeParse({ ...valid, consent });
    expect(result.success).toBe(false);
  });

  it('says why consent was refused', () => {
    expect(messages(inquiryInputSchema.safeParse({ ...valid, consent: false }))).toEqual(['Consent is required to send an Inquiry']);
  });

  it('repeats the limits Strapi has on the Inquiry type', () => {
    expect(inquiryInputSchema.safeParse({ ...valid, name: 'n'.repeat(120) }).success).toBe(true);
    expect(inquiryInputSchema.safeParse({ ...valid, name: 'n'.repeat(121) }).success).toBe(false);
    expect(inquiryInputSchema.safeParse({ ...valid, message: 'm'.repeat(5000) }).success).toBe(true);
    expect(inquiryInputSchema.safeParse({ ...valid, message: 'm'.repeat(5001) }).success).toBe(false);
    expect(inquiryInputSchema.safeParse({ ...valid, email: 'not an email' }).success).toBe(false);
    expect(inquiryInputSchema.safeParse({ ...valid, email: `${'a'.repeat(250)}@example.com` }).success).toBe(false);
    expect(inquiryInputSchema.safeParse({ ...valid, kind: 'complaint' }).success).toBe(false);
  });

  it('treats a name or message of only spaces as empty and trims the rest', () => {
    expect(inquiryInputSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
    expect(inquiryInputSchema.safeParse({ ...valid, message: '\n ' }).success).toBe(false);
    expect(inquiryInputSchema.parse({ ...valid, name: '  Visitor ' }).name).toBe('Visitor');
  });
});

describe('alt text', () => {
  const home = loadFixture('home-page-published');

  it.each([
    [0, 'statement'],
    [4, 'studioIntroduction'],
  ])('drops Section %i, a %s that sets an image without imageAlt, and keeps the rest of the page', (index, type) => {
    for (const imageAlt of [null, '', '   ']) {
      const result = parseContent(sectionsPage, change(home, ['data', 'sections', index, 'imageAlt'], imageAlt));
      expect(dropsOf(result), JSON.stringify(imageAlt)).toEqual([[`Section[${index}]`, ['imageAlt: Alt text is required when an image is set']]]);
      const kept = valueOf(result).sections.map((section) => section.type);
      expect(kept).toHaveLength(7);
      expect(kept).not.toContain(type);
    }
  });

  it('does not ask for alt text when there is no image', () => {
    const noImage = change(change(home, ['data', 'sections', 0, 'image'], null), ['data', 'sections', 0, 'imageAlt'], null);
    expect(parseContent(sectionsPage, noImage)).toMatchObject({ ok: true, dropped: [] });
  });

  it('carries the alt text into the image', () => {
    const section = valueOf(parseContent(sectionsPage, home)).sections[0];
    expect(section).toMatchObject({ type: 'statement', image: { alt: 'Deep timber eaves over a courtyard' } });
  });

  it('refuses a Project whose cover has no alternative text', () => {
    const project = loadFixture('project-published');
    for (const alternativeText of [null, '', '  ']) {
      const result = documents(projectSchema).safeParse(change(project, ['data', 0, 'cover', 'alternativeText'], alternativeText));
      expect(messages(result)).toEqual(['Alternative text is required']);
    }
  });

  it.each([
    [1, ['alt'], 'image'],
    [2, ['left', 'alt'], 'imagePair'],
  ])('drops Block %i, an %s Block with no alt text, and keeps the rest of the body', (index, path, type) => {
    const project = loadFixture('project-published');
    const result = parseContent(projects, change(project, ['data', 0, 'body', index, ...path], null));
    expect(dropsOf(result)).toEqual([[`Project[0] > Block[${index}]`, [expect.stringMatching(new RegExp(`^${path.join('\\.')}: `))]]]);
    expect(result.dropped[0].path[1].id).toBe(read(project, ['data', 0, 'body', index, '__component']));
    const kept = valueOf(result).items[0].body.map((block) => block.type);
    expect(kept).toHaveLength(5);
    expect(kept).not.toContain(type);
  });

  it('does not ask for alt text on a share image, which is never shown on the page', () => {
    const project = loadFixture('project-published');
    const noAlt = change(project, ['data', 0, 'seo', 'shareImage', 'alternativeText'], null);
    expect(parseContent(projects, noAlt)).toMatchObject({ ok: true, dropped: [] });
  });
});

describe('Selected Projects', () => {
  const home = loadFixture('home-page-published');
  const projectsPath = ['data', 'sections', 1, 'projects'];
  const card = read(home, [...projectsPath, 0]);
  const withProjects = (count: number) => change(home, projectsPath, Array.from({ length: count }, () => structuredClone(card)));
  const withoutAlt = (fixture: ReturnType<typeof withProjects>) => change(fixture, [...projectsPath, 0, 'cover', 'alternativeText'], null);
  const RULE = 'projects: Selected Projects needs 3 to 6 Projects';
  const CARD_WITHOUT_ALT = ['Section[1] > Project card[0]', ['cover.alternativeText: Alternative text is required']];

  it.each([3, 4, 5, 6])('accepts %i Projects', (count) => {
    expect(parseContent(sectionsPage, withProjects(count))).toMatchObject({ ok: true, dropped: [] });
  });

  it.each([0, 1, 2, 7, 12])('drops the Section with %i Projects and keeps the rest of the page', (count) => {
    const result = parseContent(sectionsPage, withProjects(count));
    expect(dropsOf(result)).toEqual([['Section[1]', [RULE]]]);
    const kept = valueOf(result).sections.map((section) => section.type);
    expect(kept).toHaveLength(7);
    expect(kept).not.toContain('selectedProjects');
  });

  it('drops a broken card and keeps the Section while three remain', () => {
    const result = parseContent(sectionsPage, withoutAlt(withProjects(4)));
    expect(dropsOf(result)).toEqual([CARD_WITHOUT_ALT]);
    expect(valueOf(result).sections[1]).toMatchObject({ type: 'selectedProjects', projects: [{}, {}, {}] });
  });

  it('drops the Section when a broken card leaves fewer than three, and names that card as the cause', () => {
    const result = parseContent(sectionsPage, withoutAlt(withProjects(3)));
    expect(dropsOf(result)).toEqual([['Section[1]', [RULE]]]);
    expect(result.dropped[0].causes.map((cause) => [where(cause), cause.reasons])).toEqual([CARD_WITHOUT_ALT]);
  });

  it('applies to the Studio page too, which shares the catalogue', () => {
    const studio = loadFixture('studio-page-published');
    const withSection = change(studio, ['data', 'sections'], [{ ...(read(home, ['data', 'sections', 1]) as object) }]);
    const result = parseContent(sectionsPage, change(withSection, ['data', 'sections', 0, 'projects'], [card]));
    expect(dropsOf(result)).toEqual([['Section[0]', [RULE]]]);
  });

  it('is not enforced on a draft, where fewer Projects may simply not be chosen yet', () => {
    const draft = single(sectionsPageDraftSchema).parse(change(home, projectsPath, [card]));
    expect(draft.sections?.[1]).toMatchObject({ type: 'selectedProjects', projects: [{ title: 'Linden House' }] });
  });
});

describe('reserved Page slugs', () => {
  const page = loadFixture('page-published');
  const withSlug = (slug: string) => change(page, ['data', 0, 'slug'], slug);

  it.each(RESERVED_PAGE_SLUGS)('refuses the slug %s', (slug) => {
    expect(messages(documents(pageSchema).safeParse(withSlug(slug)))).toEqual([expect.stringContaining(`The slug "${slug}" is reserved for a route`)]);
  });

  it('matches a reserved slug whatever its case', () => {
    expect(documents(pageSchema).safeParse(withSlug('API')).success).toBe(false);
  });

  it.each(['privacy', 'about-this-demo', 'projects-archive', 'the', 'thai'])('accepts the slug %s', (slug) => {
    expect(valueOf(parseContent(pages, withSlug(slug))).items).toMatchObject([{ slug }]);
  });

  it('is not enforced on a draft', () => {
    expect(parseContent(collection(pageDraftSchema, 'Page'), withSlug('journal'))).toMatchObject({ ok: true, dropped: [] });
  });
});

describe('what the schemas add to what Strapi checks', () => {
  const settings = loadFixture('site-settings-published');
  const siteSettings = single(siteSettingsSchema);
  const withHref = (list: string, href: string) => change(settings, ['data', list, 0, 'href'], href);

  it.each(['/projects', '/', 'https://example.com/path?q=1'])('accepts the link %s', (href) => {
    const result = parseContent(siteSettings, withHref('headerNavigation', href));
    expect(result.dropped).toEqual([]);
    expect(valueOf(result).headerNavigation[0].href).toBe(href);
  });

  it.each(['javascript:alert(1)', '//evil.example', 'http://example.com', 'data:text/html,x', 'projects', '/a b'])(
    'never shows the link %s, and drops it from the navigation',
    (href) => {
      const result = parseContent(siteSettings, withHref('headerNavigation', href));
      expect(dropsOf(result)).toEqual([['Header navigation link[0]', [expect.stringMatching(/^href: /)]]]);
      expect(valueOf(result).headerNavigation.map((link) => link.href)).toEqual(['/journal']);
    }
  );

  it.each([
    ['socialLinks', 'Social link'],
    ['footerNavigation', 'Footer navigation link'],
  ] as const)('drops a script link from %s too', (list, what) => {
    const result = parseContent(siteSettings, withHref(list, 'javascript:alert(1)'));
    expect(dropsOf(result)).toEqual([[`${what}[0]`, [expect.stringMatching(/^href: /)]]]);
    expect(valueOf(result)[list]).toEqual([]);
  });

  it('accepts a relative and an absolute media URL', () => {
    const project = loadFixture('project-published');
    for (const url of ['/uploads/linden.png', 'https://media.example.com/uploads/linden.png']) {
      const parsed = parseContent(projects, change(project, ['data', 0, 'cover', 'url'], url));
      expect(valueOf(parsed).items[0].cover.url).toBe(url);
    }
  });

  it('drops a Text Block holding a rich text image node, because the Image Block carries the alt text', () => {
    const project = loadFixture('project-published');
    const image = { type: 'image', image: { url: '/uploads/x.png', alternativeText: 'x' }, children: [{ type: 'text', text: '' }] };
    const body = read(project, ['data', 0, 'body', 0, 'body']) as unknown[];
    const result = parseContent(projects, change(project, ['data', 0, 'body', 0, 'body'], [...(body as never[]), image as never]));
    expect(dropsOf(result)).toEqual([['Project[0] > Block[0]', [expect.stringMatching(/^body\.6: /)]]]);
    expect(valueOf(result).items[0].body.map((block) => block.type)).not.toContain('text');
  });

  it('drops a Text Block holding a rich text link to a script, so the script never reaches a page', () => {
    const project = loadFixture('project-published');
    const result = parseContent(projects, change(project, ['data', 0, 'body', 0, 'body', 1, 'children', 11, 'url'], 'javascript:alert(1)'));
    expect(dropsOf(result)).toEqual([['Project[0] > Block[0]', [expect.stringMatching(/^body\.1\.children\.11\.url: /)]]]);
    expect(JSON.stringify(valueOf(result))).not.toContain('javascript:');
  });

  it('fails on a block type the web app does not know, because the web app is behind the CMS', () => {
    const project = loadFixture('project-published');
    const unknown = change(project, ['data', 0, 'body', 0, '__component'], 'blocks.video');
    expect(parseContent(projects, unknown)).toMatchObject({ ok: false, problems: [expect.stringMatching(/^data\.0\.body\.0\.__component: /)] });
    expect(parseContent(collection(projectDraftSchema, 'Project'), unknown).ok).toBe(false);
  });

  it('treats a whitespace-only title as missing', () => {
    expect(documents(projectSchema).safeParse(change(loadFixture('project-published'), ['data', 0, 'title'], '  ')).success).toBe(false);
  });
});
