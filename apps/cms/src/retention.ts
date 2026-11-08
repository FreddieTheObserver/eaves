import type { Core } from '@strapi/strapi';
import { INQUIRY } from './access/constants';

const RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

// Inquiries are personal data, kept for 90 days under the PDPA (ADR 0002). An Inquiry has no drafts or locales, so
// each row is a whole document and one query can remove them. The age is checked on every run, so a missed day
// catches up on the next one.
export const deleteExpiredInquiries = async (strapi: Core.Strapi, now = new Date()) => {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
  const { count } = await strapi.db.query(INQUIRY).deleteMany({ where: { createdAt: { $lt: cutoff } } });
  strapi.log.info(`Deleted ${count} Inquiries older than ${RETENTION_DAYS} days.`);
  return count;
};
