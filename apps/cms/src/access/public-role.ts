import type { Core } from '@strapi/strapi';

// The Public role must have no permissions. Strapi seeds it with sign-in and registration routes
// for end users, which this site does not use.
export const lockPublicRole = async (strapi: Core.Strapi) => {
  const role = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'public' } });
  if (!role) return;

  await strapi.db.query('plugin::users-permissions.permission').deleteMany({ where: { role: role.id } });
};
