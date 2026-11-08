// The web app's limits from apps/web/src/content/rules.json, repeated because the CMS cannot import the web
// app at runtime. The publish-rules check reads that file and fails when these drift from it.
export const RESERVED_PAGE_SLUGS = ['projects', 'services', 'journal', 'studio', 'contact', 'api', 'th'];
export const SELECTED_PROJECTS = { min: 3, max: 6 };
