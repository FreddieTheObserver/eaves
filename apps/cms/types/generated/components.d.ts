import type { Schema, Struct } from '@strapi/strapi';

export interface BlocksDrawing extends Struct.ComponentSchema {
  collectionName: 'components_blocks_drawings';
  info: {
    displayName: 'Drawing';
    icon: 'pencil';
  };
  attributes: {
    alt: Schema.Attribute.String & Schema.Attribute.Required;
    caption: Schema.Attribute.String & Schema.Attribute.Required;
    image: Schema.Attribute.Media<'images'> & Schema.Attribute.Required;
    kind: Schema.Attribute.Enumeration<['plan', 'section', 'elevation']> &
      Schema.Attribute.Required;
  };
}

export interface BlocksGallery extends Struct.ComponentSchema {
  collectionName: 'components_blocks_gallerys';
  info: {
    displayName: 'Gallery';
    icon: 'grid';
  };
  attributes: {
    items: Schema.Attribute.Component<'shared.figure', true> &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 2;
        },
        number
      >;
  };
}

export interface BlocksImage extends Struct.ComponentSchema {
  collectionName: 'components_blocks_images';
  info: {
    displayName: 'Image';
    icon: 'picture';
  };
  attributes: {
    alt: Schema.Attribute.String & Schema.Attribute.Required;
    caption: Schema.Attribute.String;
    image: Schema.Attribute.Media<'images'> & Schema.Attribute.Required;
  };
}

export interface BlocksImagePair extends Struct.ComponentSchema {
  collectionName: 'components_blocks_image_pairs';
  info: {
    displayName: 'Image pair';
    icon: 'apps';
  };
  attributes: {
    left: Schema.Attribute.Component<'shared.figure', false> &
      Schema.Attribute.Required;
    right: Schema.Attribute.Component<'shared.figure', false> &
      Schema.Attribute.Required;
  };
}

export interface BlocksQuote extends Struct.ComponentSchema {
  collectionName: 'components_blocks_quotes';
  info: {
    displayName: 'Quote';
    icon: 'quote';
  };
  attributes: {
    speaker: Schema.Attribute.Relation<
      'manyToOne',
      'api::team-member.team-member'
    >;
    text: Schema.Attribute.Text & Schema.Attribute.Required;
  };
}

export interface BlocksText extends Struct.ComponentSchema {
  collectionName: 'components_blocks_texts';
  info: {
    displayName: 'Text';
    icon: 'write';
  };
  attributes: {
    body: Schema.Attribute.Blocks & Schema.Attribute.Required;
  };
}

export interface SectionsContactPrompt extends Struct.ComponentSchema {
  collectionName: 'components_sections_contact_prompts';
  info: {
    displayName: 'Contact prompt';
    icon: 'envelope';
  };
  attributes: {
    heading: Schema.Attribute.String & Schema.Attribute.Required;
    linkLabel: Schema.Attribute.String & Schema.Attribute.Required;
    text: Schema.Attribute.Text;
  };
}

export interface SectionsFigureItem extends Struct.ComponentSchema {
  collectionName: 'components_sections_figure_items';
  info: {
    displayName: 'Figure';
    icon: 'hashtag';
  };
  attributes: {
    label: Schema.Attribute.String & Schema.Attribute.Required;
    value: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SectionsFigures extends Struct.ComponentSchema {
  collectionName: 'components_sections_figuress';
  info: {
    displayName: 'Figures';
    icon: 'hashtag';
  };
  attributes: {
    heading: Schema.Attribute.String;
    items: Schema.Attribute.Component<'sections.figure-item', true> &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          max: 6;
          min: 1;
        },
        number
      >;
  };
}

export interface SectionsLatestArticles extends Struct.ComponentSchema {
  collectionName: 'components_sections_latest_articless';
  info: {
    displayName: 'Latest Articles';
    icon: 'bulletList';
  };
  attributes: {
    heading: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SectionsSelectedProjects extends Struct.ComponentSchema {
  collectionName: 'components_sections_selected_projectss';
  info: {
    displayName: 'Selected Projects';
    icon: 'star';
  };
  attributes: {
    heading: Schema.Attribute.String;
    projects: Schema.Attribute.Relation<'manyToMany', 'api::project.project'>;
  };
}

export interface SectionsServicesOverview extends Struct.ComponentSchema {
  collectionName: 'components_sections_services_overviews';
  info: {
    displayName: 'Services overview';
    icon: 'layout';
  };
  attributes: {
    heading: Schema.Attribute.String & Schema.Attribute.Required;
    intro: Schema.Attribute.Text;
  };
}

export interface SectionsStatement extends Struct.ComponentSchema {
  collectionName: 'components_sections_statements';
  info: {
    displayName: 'Statement';
    icon: 'quote';
  };
  attributes: {
    image: Schema.Attribute.Media<'images'>;
    imageAlt: Schema.Attribute.String;
    text: Schema.Attribute.Text & Schema.Attribute.Required;
  };
}

export interface SectionsStudioIntroduction extends Struct.ComponentSchema {
  collectionName: 'components_sections_studio_introductions';
  info: {
    displayName: 'Studio introduction';
    icon: 'house';
  };
  attributes: {
    heading: Schema.Attribute.String & Schema.Attribute.Required;
    image: Schema.Attribute.Media<'images'>;
    imageAlt: Schema.Attribute.String;
    linkLabel: Schema.Attribute.String & Schema.Attribute.Required;
    text: Schema.Attribute.Text & Schema.Attribute.Required;
  };
}

export interface SectionsTeam extends Struct.ComponentSchema {
  collectionName: 'components_sections_teams';
  info: {
    displayName: 'Team';
    icon: 'user';
  };
  attributes: {
    heading: Schema.Attribute.String & Schema.Attribute.Required;
    intro: Schema.Attribute.Text;
  };
}

export interface SharedCredit extends Struct.ComponentSchema {
  collectionName: 'components_shared_credits';
  info: {
    displayName: 'Credit';
    icon: 'user';
  };
  attributes: {
    role: Schema.Attribute.String & Schema.Attribute.Required;
    teamMember: Schema.Attribute.Relation<
      'manyToOne',
      'api::team-member.team-member'
    >;
  };
}

export interface SharedFigure extends Struct.ComponentSchema {
  collectionName: 'components_shared_figures';
  info: {
    displayName: 'Figure';
    icon: 'picture';
  };
  attributes: {
    alt: Schema.Attribute.String & Schema.Attribute.Required;
    caption: Schema.Attribute.String;
    image: Schema.Attribute.Media<'images'> & Schema.Attribute.Required;
  };
}

export interface SharedLink extends Struct.ComponentSchema {
  collectionName: 'components_shared_links';
  info: {
    displayName: 'Link';
    icon: 'link';
  };
  attributes: {
    href: Schema.Attribute.String & Schema.Attribute.Required;
    label: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SharedListItem extends Struct.ComponentSchema {
  collectionName: 'components_shared_list_items';
  info: {
    displayName: 'List item';
    icon: 'bulletList';
  };
  attributes: {
    text: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SharedSeo extends Struct.ComponentSchema {
  collectionName: 'components_shared_seos';
  info: {
    displayName: 'SEO';
    icon: 'search';
  };
  attributes: {
    metaDescription: Schema.Attribute.Text &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 200;
      }>;
    metaTitle: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 70;
      }>;
    shareImage: Schema.Attribute.Media<'images'>;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'blocks.drawing': BlocksDrawing;
      'blocks.gallery': BlocksGallery;
      'blocks.image': BlocksImage;
      'blocks.image-pair': BlocksImagePair;
      'blocks.quote': BlocksQuote;
      'blocks.text': BlocksText;
      'sections.contact-prompt': SectionsContactPrompt;
      'sections.figure-item': SectionsFigureItem;
      'sections.figures': SectionsFigures;
      'sections.latest-articles': SectionsLatestArticles;
      'sections.selected-projects': SectionsSelectedProjects;
      'sections.services-overview': SectionsServicesOverview;
      'sections.statement': SectionsStatement;
      'sections.studio-introduction': SectionsStudioIntroduction;
      'sections.team': SectionsTeam;
      'shared.credit': SharedCredit;
      'shared.figure': SharedFigure;
      'shared.link': SharedLink;
      'shared.list-item': SharedListItem;
      'shared.seo': SharedSeo;
    }
  }
}
