// The web app's own content types. Pages and components import these and never see a Strapi response.
// Every `id` is the Strapi documentId, because cache tags and slug redirects are keyed by it.

export type Image = { url: string; width: number; height: number; alt: string };
export type ShareImage = { url: string; width: number; height: number };
export type Seo = { metaTitle?: string; metaDescription?: string; shareImage?: ShareImage };
export type Link = { label: string; href: string };
export type Figure = { image: Image; caption?: string };

export type RichTextText = {
  type: 'text';
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
};
export type RichTextLink = { type: 'link'; url: string; children: RichTextText[] };
export type RichTextInline = RichTextText | RichTextLink;
export type RichTextListItem = { type: 'list-item'; children: RichTextInline[] };
export type RichTextList = { type: 'list'; format: 'ordered' | 'unordered'; children: (RichTextListItem | RichTextList)[] };
export type RichTextNode =
  | { type: 'paragraph'; children: RichTextInline[] }
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: RichTextInline[] }
  | { type: 'quote'; children: RichTextInline[] }
  | { type: 'code'; children: RichTextInline[] }
  | RichTextList;
export type RichText = RichTextNode[];

export type Typology = { id: string; name: string; slug: string };
export type Topic = { id: string; name: string; slug: string };
export type ServiceRef = { id: string; name: string; slug: string };
export type TeamMemberRef = { id: string; name: string; position: string };

export type DrawingKind = 'plan' | 'section' | 'elevation';
export type Block =
  | { type: 'text'; body: RichText }
  | { type: 'image'; image: Image; caption?: string }
  | { type: 'imagePair'; left: Figure; right: Figure }
  | { type: 'gallery'; items: Figure[] }
  | { type: 'quote'; text: string; speaker?: TeamMemberRef }
  | { type: 'drawing'; kind: DrawingKind; image: Image; caption: string };

export type ProjectStage = 'completed' | 'under_construction' | 'concept';
export type Credit = { role: string; teamMember: TeamMemberRef };
export type ProjectCard = {
  id: string;
  locale: string;
  slug: string;
  title: string;
  summary: string;
  cover: Image;
  typology: Typology;
  location: { neighbourhood: string; city: string };
  year: number;
  stage: ProjectStage;
};
export type Project = ProjectCard & {
  floorArea: number;
  services: ServiceRef[];
  credits: Credit[];
  body: Block[];
  seo: Seo;
};

export type Service = {
  id: string;
  locale: string;
  slug: string;
  name: string;
  summary: string;
  cover: Image;
  spaces: string[];
  scope: string[];
  order: number;
  body: Block[];
  seo: Seo;
};

export type TeamMember = {
  id: string;
  locale: string;
  name: string;
  position: string;
  portrait: Image;
  bio: string;
  order: number;
};

export type ArticleCard = {
  id: string;
  locale: string;
  slug: string;
  title: string;
  excerpt: string;
  cover: Image;
  topic: Topic;
  publicationDate: string;
};
export type Article = ArticleCard & {
  byline: TeamMemberRef[];
  relatedProjects: ProjectCard[];
  body: Block[];
  seo: Seo;
};

export type Page = { id: string; locale: string; slug: string; title: string; body: Block[]; seo: Seo };

export type Section =
  | { type: 'statement'; text: string; image?: Image }
  | { type: 'selectedProjects'; heading?: string; projects: ProjectCard[] }
  | { type: 'servicesOverview'; heading: string; intro?: string }
  | { type: 'latestArticles'; heading: string }
  | { type: 'studioIntroduction'; heading: string; text: string; image?: Image; linkLabel: string }
  | { type: 'team'; heading: string; intro?: string }
  | { type: 'figures'; heading?: string; items: { value: string; label: string }[] }
  | { type: 'contactPrompt'; heading: string; text?: string; linkLabel: string };
export type SectionsPage = { id: string; locale: string; sections: Section[]; seo: Seo };
export type HomePage = SectionsPage;
export type StudioPage = SectionsPage;

export type SiteSettings = {
  id: string;
  locale: string;
  contactEmail: string;
  contactLocation?: string;
  socialLinks: Link[];
  headerNavigation: Link[];
  footerNavigation: Link[];
  demoNotice: string;
  notFound: { title: string; text: string };
  defaultSeo: Seo;
};

export type SlugTargetType = 'project' | 'article' | 'service' | 'page';
export type SlugHistoryEntry = { id: string; oldPath: string; targetType: SlugTargetType; targetId: string };

export type InquiryKind = 'new_project' | 'press' | 'other';
export type InquiryInput = { name: string; email: string; kind: InquiryKind; message: string; consent: true };

export type Pagination = { page: number; pageSize: number; pageCount: number; total: number };
export type Collection<T> = { items: T[]; pagination: Pagination };

// What a draft can hold: the same shape as the published type with everything optional except the
// identity keys and lists, because a draft can be missing fields that its published version always has.
type Identity = 'id' | 'locale' | 'type';
type Present<T> = { [K in keyof T]-?: K extends Identity ? K : T[K] extends readonly unknown[] ? K : never }[keyof T];
export type Draft<T> = T extends RichTextNode
  ? T
  : T extends readonly (infer Item)[]
    ? Draft<Item>[]
    : T extends object
      ? { [K in Present<T>]: Draft<T[K]> } & { [K in Exclude<keyof T, Present<T>>]?: Draft<T[K]> }
      : T;

export type ProjectCardDraft = Draft<ProjectCard>;
export type ProjectDraft = Draft<Project>;
export type ServiceDraft = Draft<Service>;
export type TeamMemberDraft = Draft<TeamMember>;
export type ArticleCardDraft = Draft<ArticleCard>;
export type ArticleDraft = Draft<Article>;
export type PageDraft = Draft<Page>;
export type SectionsPageDraft = Draft<SectionsPage>;
export type SiteSettingsDraft = Draft<SiteSettings>;
