import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import rules from './rules.json';
import { RESERVED_PAGE_SLUGS } from './schemas';
import { linkSchema } from './schemas/shared';

// Checks the seed files themselves against section 14 of the design document and ADR 0002, so editing the copy
// cannot quietly break them. It needs no Strapi; pnpm check:seed covers loading the same files.
const seedDir = fileURLToPath(new URL('../../../cms/seed/', import.meta.url));

const text = (file: string) => readFileSync(`${seedDir}${file}`, 'utf8');
const json = <T>(name: string) => JSON.parse(text(`${name}.json`)) as T;

type Seo = { metaTitle?: string; metaDescription?: string };
type Named = { name: string; slug: string };
type Service = Named & { summary: string; spaces: string[]; scope: string[]; seo?: Seo };
type Project = { title: string; slug: string; summary: string; services: string[]; typology: string; stage: string; year: number; credits: { role: string; teamMember: string }[]; seo?: Seo };
type Article = { title: string; excerpt: string; topic: string; publicationDate: string; byline: string[]; seo?: Seo };
type Page = { slug: string; seo?: Seo };
type Link = { label: string; href: string };
type Section = { type: string; projects?: string[] };
type SectionsPage = { sections: Section[]; seo?: Seo };
type TeamMember = { name: string; position: string; order: number };
type SiteSettings = { contactEmail: string; socialLinks: Link[]; headerNavigation: Link[]; footerNavigation: Link[]; demoNotice: string; defaultSeo: Seo };
type ImageEntry = { alt: string; aspect: string };

const services = json<Service[]>('services');
const projects = json<Project[]>('projects');
const articles = json<Article[]>('articles');
const pages = json<Page[]>('pages');
const typologies = json<Named[]>('typologies');
const topics = json<Named[]>('topics');
const teamMembers = json<TeamMember[]>('team-members');
const homePage = json<SectionsPage>('home-page');
const studioPage = json<SectionsPage>('studio-page');
const siteSettings = json<SiteSettings>('site-settings');
const images = json<Record<string, ImageEntry>>('images');

const bodyFolders = ['projects', 'services', 'articles', 'pages'];
const bodies = bodyFolders.flatMap((folder) => readdirSync(`${seedDir}bodies/${folder}`).map((file) => text(`bodies/${folder}/${file}`)));
const jsonFiles = readdirSync(seedDir).filter((file) => file.endsWith('.json'));
const everything = [...jsonFiles.map(text), ...bodies].join('\n');

const seoGroups = [...services, ...projects, ...articles, ...pages, homePage, studioPage].map((item) => item.seo).concat(siteSettings.defaultSeo);

const SERVICES: Record<string, { spaces: string[]; scope: string[] }> = {
  'Residential Interior Design': {
    spaces: ['Houses', 'Condominiums', 'Private residences'],
    scope: ['Space planning', 'Interior concepts', '3D visualization', 'Material and furniture selection', 'Design documentation'],
  },
  'Commercial Interior Design': {
    spaces: ['Cafes', 'Restaurants', 'Retail stores', 'Showrooms', 'Customer-facing spaces'],
    scope: ['Brand-inspired interiors', 'Customer flow', 'Space planning', 'Design development'],
  },
  'Architectural Design': {
    spaces: ['New residential and small commercial buildings'],
    scope: ['Concept development', 'Site and spatial planning', 'Architectural drawings', 'Design coordination'],
  },
  'Workplace Design': {
    spaces: ['Offices and professional work environments'],
    scope: ['Workplace planning', 'Meeting and collaboration areas', 'Lighting and acoustic considerations', 'Furniture and material specifications'],
  },
  'Renovation & Space Planning': {
    spaces: ['Existing residential and commercial spaces'],
    scope: ['Existing-space assessment', 'Layout improvements', 'Renovation concepts', 'Material and finish recommendations'],
  },
};

describe('the seed holds what section 14 asks for', () => {
  it('has the five Services with their Spaces and Scope', () => {
    expect(Object.fromEntries(services.map((service) => [service.name, { spaces: service.spaces, scope: service.scope }]))).toEqual(SERVICES);
  });

  it('has exactly the three Typologies', () => {
    expect(typologies.map((typology) => typology.name)).toEqual(['Residential', 'Commercial', 'Workplace']);
  });

  it('has eight Projects covering every Service and Typology', () => {
    expect(projects).toHaveLength(8);
    expect(new Set(projects.flatMap((project) => project.services))).toEqual(new Set(services.map((service) => service.slug)));
    expect(new Set(projects.map((project) => project.typology))).toEqual(new Set(typologies.map((typology) => typology.slug)));
  });

  it('has at least one Concept and one Project under construction', () => {
    expect(projects.some((project) => project.stage === 'concept')).toBe(true);
    expect(projects.some((project) => project.stage === 'under_construction')).toBe(true);
  });

  it('has six Articles across three Topics, with different dates', () => {
    expect(articles).toHaveLength(6);
    expect(topics).toHaveLength(3);
    expect(new Set(articles.map((article) => article.topic))).toEqual(new Set(topics.map((topic) => topic.slug)));
    expect(new Set(articles.map((article) => article.publicationDate)).size).toBe(6);
  });

  it('has eight Team Members in a clear order', () => {
    expect(teamMembers).toHaveLength(8);
    expect(new Set(teamMembers.map((member) => member.order)).size).toBe(8);
  });

  it('has the Privacy and About this demo Pages, neither on a reserved slug', () => {
    expect(pages.map((page) => page.slug).sort()).toEqual(['about-this-demo', 'privacy']);
    expect(pages.filter((page) => RESERVED_PAGE_SLUGS.includes(page.slug))).toEqual([]);
  });

  it('keeps Selected Projects within the bounds', () => {
    const selected = [...homePage.sections, ...studioPage.sections].filter((section) => section.type === 'selected-projects');
    expect(selected.length).toBeGreaterThan(0);
    for (const section of selected) {
      expect(section.projects?.length).toBeGreaterThanOrEqual(rules.selectedProjects.min);
      expect(section.projects?.length).toBeLessThanOrEqual(rules.selectedProjects.max);
    }
  });
});

describe('the seed fits the fields it fills', () => {
  it('keeps summaries, excerpts and SEO text within their limits', () => {
    expect([...services, ...projects].filter((item) => item.summary.length > 200).map((item) => item.summary)).toEqual([]);
    expect(articles.filter((article) => article.excerpt.length > 300).map((article) => article.title)).toEqual([]);
    expect(seoGroups.filter((seo) => (seo?.metaTitle?.length ?? 0) > 70).map((seo) => seo?.metaTitle)).toEqual([]);
    expect(seoGroups.filter((seo) => (seo?.metaDescription?.length ?? 0) > 200).map((seo) => seo?.metaDescription)).toEqual([]);
  });

  it('gives every image a described scene', () => {
    expect(Object.entries(images).filter(([, image]) => image.alt.trim().length < 10).map(([file]) => file)).toEqual([]);
  });
});

describe('the seed keeps to ADR 0002', () => {
  it('says the Studio is fictional in every page description', () => {
    expect(seoGroups.filter((seo) => !seo?.metaDescription || !/fictional/i.test(seo.metaDescription.slice(0, 100))).map((seo) => seo?.metaTitle)).toEqual([]);
  });

  it('has a Demo Notice saying the Studio is fictional and every image AI-generated', () => {
    expect(siteSettings.demoNotice).toMatch(/fictional/i);
    expect(siteSettings.demoNotice).toMatch(/AI-generated/i);
  });

  it('never calls an image a photograph', () => {
    expect(Object.values(images).filter((image) => /photo/i.test(image.alt)).map((image) => image.alt)).toEqual([]);
  });

  it('uses designer titles in Positions and Credit roles', () => {
    const titles = [...teamMembers.map((member) => member.position), ...projects.flatMap((project) => project.credits.map((credit) => credit.role))];
    expect(titles.filter((title) => /registered|\barchitects?\b/i.test(title))).toEqual([]);
  });

  it('claims no licence or construction service', () => {
    expect(everything.match(/\blicen[cs]ed\b|licen[cs]e number|registered architect|architect council|construction management/gi)).toBeNull();
  });

  it('never says the Studio builds', () => {
    expect(everything.match(/\b(we|the studio) (built|build|constructed|construct)\b/gi)).toBeNull();
  });

  it('says the Studio holds no licences, on the About this demo page', () => {
    expect(text('bodies/pages/about-this-demo.md')).toMatch(/holds no professional licences/);
  });

  it('states the retention periods on the Privacy page', () => {
    const privacy = text('bodies/pages/privacy.md');
    expect(privacy).toMatch(/after 90 days/);
    expect(privacy).toMatch(/up to 30 more days/);
  });

  it('uses email addresses only on a domain we own', () => {
    expect((everything.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? []).filter((email) => !email.endsWith('layaungphyo.dev'))).toEqual([]);
  });

  it('links only to safe addresses', () => {
    const links = [...siteSettings.socialLinks, ...siteSettings.headerNavigation, ...siteSettings.footerNavigation];
    expect(links.filter((link) => !linkSchema.safeParse(link).success)).toEqual([]);
  });

  it('uses no em dashes', () => {
    expect(everything.includes(String.fromCodePoint(0x2014))).toBe(false);
  });
});
