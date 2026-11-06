import { factories } from '@strapi/strapi';

// Create-only: a built-in read-only API token must never be able to list Inquiries (PDPA personal data).
// Editors read them through the admin Content Manager.
export default factories.createCoreRouter('api::inquiry.inquiry', { only: ['create'] });
