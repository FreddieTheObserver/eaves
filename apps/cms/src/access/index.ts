import type { Core } from '@strapi/strapi';
import { lockPublicRole } from './public-role';
import { reconcileAdminRoles } from './roles';
import { reconcileApiTokens } from './tokens';

// Runs on every boot, so a fresh database and a long-lived one end up with the same access setup.
export const reconcileAccess = async (strapi: Core.Strapi) => {
  await reconcileAdminRoles(strapi);
  await lockPublicRole(strapi);
  await reconcileApiTokens(strapi);
};
