import { describe, expect, it } from 'vitest';
import {
  RESERVED_PAGE_SLUGS,
  articleSchema,
  collection,
  inquiryInputSchema,
  pageDraftSchema,
  pageSchema,
  projectDraftSchema,
  projectSchema,
  sectionsPageDraftSchema,
  sectionsPageSchema,
  single,
  siteSettingsSchema,
} from './schemas';
import { change, loadFixture, read } from './testing/fixtures';

const projects = collection(projectSchema);
const articles = collection(articleSchema);
const pages = collection(pageSchema);
const sectionsPage = single(sectionsPageSchema);
const messages = (result: { error?: { issues: { message: string }[] } }) => (result.error?.issues ?? []).map((issue) => issue.message);

describe('required relations', () => {
  const project = loadFixture('project-published');

  it('refuses a Project with no Typology', () => {
    const result = projects.safeParse(change(project, ['data', 0, 'typology'], null));
    expect(messages(result)).toEqual(['A Project must have a Typology']);
  });

  it('refuses a Project with no Services', () => {
    const result = projects.safeParse(change(project, ['data', 0, 'services'], []));
    expect(messages(result)).toEqual(['A Project must have at least one Service']);
  });

  it('refuses a Credit that names no Team Member', () => {
    const result = projects.safeParse(change(project, ['data', 0, 'credits', 1, 'teamMember'], null));
    expect(messages(result)).toEqual(['A Credit must name a Team Member']);
  });

  it('accepts a Project with no Credits and a Quote with no speaker', () => {
    const bare = change(change(project, ['data', 0, 'credits'], []), ['data', 0, 'body', 4, 'speaker'], null);
    expect(projects.safeParse(bare).success).toBe(true);
  });

  it('refuses an Article with no Topic or no Byline', () => {
    const article = loadFixture('article-published');
    expect(messages(articles.safeParse(change(article, ['data', 0, 'topic'], null)))).toEqual(['An Article must have a Topic']);
    expect(messages(articles.safeParse(change(article, ['data', 0, 'byline'], [])))).toEqual([
      'An Article must name at least one Team Member in its Byline',
    ]);
  });

  it('accepts an Article with no related Projects', () => {
    expect(articles.safeParse(change(loadFixture('article-published'), ['data', 0, 'relatedProjects'], [])).success).toBe(true);
  });

  it('fails when a populate is missing, so a wrong query cannot pass as empty content', () => {
    const withoutTypology = structuredClone(project) as { data: Record<string, unknown>[] };
    delete withoutTypology.data[0].typology;
    expect(projects.safeParse(withoutTypology).success).toBe(false);
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
  const statementAlt = ['data', 'sections', 0, 'imageAlt'];
  const introAlt = ['data', 'sections', 4, 'imageAlt'];

  it('requires imageAlt on a Statement and a Studio introduction that set an image', () => {
    for (const path of [statementAlt, introAlt]) {
      for (const imageAlt of [null, '', '   ']) {
        const result = sectionsPage.safeParse(change(home, path, imageAlt));
        expect(messages(result), `${path.join('.')} = ${JSON.stringify(imageAlt)}`).toEqual(['Alt text is required when an image is set']);
      }
    }
  });

  it('does not ask for alt text when there is no image', () => {
    const noImage = change(change(home, ['data', 'sections', 0, 'image'], null), statementAlt, null);
    expect(sectionsPage.safeParse(noImage).success).toBe(true);
  });

  it('carries the alt text into the image', () => {
    const section = sectionsPage.parse(home).sections[0];
    expect(section).toMatchObject({ type: 'statement', image: { alt: 'Deep timber eaves over a courtyard' } });
  });

  it('requires alternative text on a cover, a portrait and every other image shown on the page', () => {
    const project = loadFixture('project-published');
    for (const alternativeText of [null, '', '  ']) {
      expect(projects.safeParse(change(project, ['data', 0, 'cover', 'alternativeText'], alternativeText)).success).toBe(false);
    }
    expect(projects.safeParse(change(project, ['data', 0, 'body', 1, 'alt'], '')).success).toBe(false);
    expect(projects.safeParse(change(project, ['data', 0, 'body', 2, 'left', 'alt'], null)).success).toBe(false);
  });

  it('does not ask for alt text on a share image, which is never shown on the page', () => {
    const project = loadFixture('project-published');
    const noAlt = change(project, ['data', 0, 'seo', 'shareImage', 'alternativeText'], null);
    expect(projects.safeParse(noAlt).success).toBe(true);
  });
});

describe('Selected Projects', () => {
  const home = loadFixture('home-page-published');
  const projectsPath = ['data', 'sections', 1, 'projects'];
  const card = read(home, [...projectsPath, 0]);
  const withProjects = (count: number) => change(home, projectsPath, Array.from({ length: count }, () => card));

  it.each([3, 4, 5, 6])('accepts %i Projects', (count) => {
    expect(sectionsPage.safeParse(withProjects(count)).success).toBe(true);
  });

  it.each([0, 1, 2, 7, 12])('refuses %i Projects', (count) => {
    const result = sectionsPage.safeParse(withProjects(count));
    expect(messages(result)).toEqual(['Selected Projects needs between three and six Projects']);
  });

  it('applies to the Studio page too, which shares the catalogue', () => {
    const studio = loadFixture('studio-page-published');
    const withSection = change(studio, ['data', 'sections'], [{ ...(read(home, ['data', 'sections', 1]) as object) }]);
    expect(sectionsPage.safeParse(change(withSection, ['data', 'sections', 0, 'projects'], [card])).success).toBe(false);
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
    expect(messages(pages.safeParse(withSlug(slug)))).toEqual([expect.stringContaining(`The slug "${slug}" is reserved for a route`)]);
  });

  it('matches a reserved slug whatever its case', () => {
    expect(pages.safeParse(withSlug('API')).success).toBe(false);
  });

  it.each(['privacy', 'about-this-demo', 'projects-archive', 'the', 'thai'])('accepts the slug %s', (slug) => {
    expect(pages.safeParse(withSlug(slug)).success).toBe(true);
  });

  it('is not enforced on a draft', () => {
    expect(collection(pageDraftSchema).safeParse(withSlug('journal')).success).toBe(true);
  });
});

describe('what the schemas add to what Strapi checks', () => {
  const settings = loadFixture('site-settings-published');
  const siteSettings = single(siteSettingsSchema);
  const withHref = (href: string) => change(settings, ['data', 'headerNavigation', 0, 'href'], href);

  it.each(['/projects', '/', 'https://example.com/path?q=1'])('accepts the link %s', (href) => {
    expect(siteSettings.safeParse(withHref(href)).success).toBe(true);
  });

  it.each(['javascript:alert(1)', '//evil.example', 'http://example.com', 'data:text/html,x', 'projects', '/a b'])('refuses the link %s', (href) => {
    expect(siteSettings.safeParse(withHref(href)).success).toBe(false);
  });

  it('accepts a relative and an absolute media URL', () => {
    const project = loadFixture('project-published');
    const absolute = change(project, ['data', 0, 'cover', 'url'], 'https://media.example.com/uploads/linden.png');
    expect(projects.parse(absolute).items[0].cover.url).toBe('https://media.example.com/uploads/linden.png');
    expect(projects.parse(project).items[0].cover.url).toMatch(/^\/uploads\//);
  });

  it('refuses a rich text image node, because the Image Block carries the alt text', () => {
    const project = loadFixture('project-published');
    const image = { type: 'image', image: { url: '/uploads/x.png', alternativeText: 'x' }, children: [{ type: 'text', text: '' }] };
    const body = read(project, ['data', 0, 'body', 0, 'body']) as unknown[];
    expect(projects.safeParse(change(project, ['data', 0, 'body', 0, 'body'], [...(body as never[]), image as never])).success).toBe(false);
  });

  it('refuses a rich text link to a script', () => {
    const project = loadFixture('project-published');
    const link = change(project, ['data', 0, 'body', 0, 'body', 1, 'children', 11, 'url'], 'javascript:alert(1)');
    expect(projects.safeParse(link).success).toBe(false);
  });

  it('refuses a block type the web app does not know', () => {
    const project = loadFixture('project-published');
    const unknown = change(project, ['data', 0, 'body', 0, '__component'], 'blocks.video');
    expect(projects.safeParse(unknown).success).toBe(false);
    expect(collection(projectDraftSchema).safeParse(unknown).success).toBe(false);
  });

  it('treats a whitespace-only title as missing', () => {
    expect(projects.safeParse(change(loadFixture('project-published'), ['data', 0, 'title'], '  ')).success).toBe(false);
  });
});
