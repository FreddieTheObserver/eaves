import 'server-only';
import { strapi, type StrapiClient } from '@strapi/client';
import { required } from './env';

const baseURL = (): string => {
  const url = required('STRAPI_URL').replace(/\/+$/, '');
  return url.endsWith('/api') ? url : `${url}/api`;
};

export const readClient = (): StrapiClient =>
  strapi({ baseURL: baseURL(), auth: required('STRAPI_READ_TOKEN') });

export const draftClient = (): StrapiClient =>
  strapi({ baseURL: baseURL(), auth: required('STRAPI_DRAFT_TOKEN') });

export const inquiryClient = (visitorIp: string): StrapiClient =>
  strapi({
    baseURL: baseURL(),
    auth: required('STRAPI_INQUIRY_TOKEN'),
    headers: { 'x-visitor-ip': visitorIp },
  });
