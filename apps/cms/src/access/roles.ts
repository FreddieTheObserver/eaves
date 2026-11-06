import type { Core } from '@strapi/strapi';
import {
  ARTICLE,
  AUTHOR_READABLE,
  EDITORIAL_COLLECTIONS,
  INQUIRY,
  REFERENCE_COLLECTIONS,
  ROLE_CODES,
  SINGLES,
  SLUG_HISTORY,
} from './constants';

type Permission = {
  action: string;
  subject?: string;
  properties?: Record<string, unknown>;
  conditions?: string[];
};

const IS_CREATOR = 'admin::is-creator';

type ContentOptions = { conditions?: string[]; omitFields?: string[] };

const contentPermissions = (
  strapi: Core.Strapi,
  action: 'create' | 'read' | 'update' | 'publish',
  subjects: string[],
  { conditions = [], omitFields = [] }: ContentOptions = {}
): Permission[] => {
  const definition = strapi.service('admin::permission').actionProvider.get(`plugin::content-manager.explorer.${action}`);
  const restrictedSubjects = definition.subjects.filter((subject: string) => !subjects.includes(subject));
  const i18n = strapi.plugin('i18n').service('content-types');

  return strapi
    .service('admin::content-type')
    .getPermissionsWithNestedFields([definition], { restrictedSubjects })
    .map(({ action: actionId, subject, properties }: Permission) => {
      const fields = (properties?.fields as string[] | undefined)?.filter((field) => !omitFields.includes(field));
      // A null locales list means every locale, so adding Thai later needs no role changes.
      const locales = i18n.isLocalizedContentType(strapi.contentType(subject as never)) ? { locales: null } : {};
      return { action: actionId, subject, conditions, properties: { ...(fields ? { fields } : {}), ...locales } };
    });
};

const uploadPermissions = (conditions: string[]): Permission[] => [
  { action: 'plugin::upload.read', conditions },
  { action: 'plugin::upload.configure-view' },
  { action: 'plugin::upload.assets.create' },
  { action: 'plugin::upload.assets.update', conditions },
  { action: 'plugin::upload.assets.download' },
  { action: 'plugin::upload.assets.copy-link' },
];

const roleDefinitions = (strapi: Core.Strapi) => ({
  [ROLE_CODES.editor]: {
    description: 'Editors create, edit, preview, and publish all content, change Site Settings, and read Inquiries.',
    permissions: [
      ...contentPermissions(strapi, 'create', [...EDITORIAL_COLLECTIONS, ...SINGLES, ...REFERENCE_COLLECTIONS]),
      ...contentPermissions(strapi, 'read', [
        ...EDITORIAL_COLLECTIONS,
        ...SINGLES,
        ...REFERENCE_COLLECTIONS,
        SLUG_HISTORY,
        INQUIRY,
      ]),
      ...contentPermissions(strapi, 'update', [...EDITORIAL_COLLECTIONS, ...SINGLES, ...REFERENCE_COLLECTIONS]),
      ...contentPermissions(strapi, 'publish', [...EDITORIAL_COLLECTIONS, ...SINGLES]),
      ...uploadPermissions([]),
    ],
  },
  [ROLE_CODES.author]: {
    description: 'Authors draft and edit their own Articles and upload images. They cannot publish.',
    permissions: [
      // The Publication date is set by an Editor, so Authors cannot write it.
      ...contentPermissions(strapi, 'create', [ARTICLE], { omitFields: ['publicationDate'] }),
      ...contentPermissions(strapi, 'read', [ARTICLE], { conditions: [IS_CREATOR] }),
      ...contentPermissions(strapi, 'update', [ARTICLE], { conditions: [IS_CREATOR], omitFields: ['publicationDate'] }),
      // Read access to the entries an Article links to, so the relation pickers work.
      ...contentPermissions(strapi, 'read', AUTHOR_READABLE),
      ...uploadPermissions([IS_CREATOR]),
    ],
  },
});

export const reconcileAdminRoles = async (strapi: Core.Strapi) => {
  const roles = strapi.service('admin::role');

  for (const [code, { description, permissions }] of Object.entries(roleDefinitions(strapi))) {
    const name = code === ROLE_CODES.editor ? 'Editor' : 'Author';
    const role = (await roles.findOne({ code })) ?? (await roles.create({ code, name, description }));
    await roles.update({ id: role.id }, { name, description });
    await roles.assignPermissions(role.id, permissions);
  }
};
