import { SELECTED_PROJECTS } from './content-rules';
import { documentIds, list, named, publishedIds } from './published';
import { SECTION_PAGES, everySection } from './sections';
import type { PublishRule } from './types';

const PROJECT = 'api::project.project';
const SELECTED = 'sections.selected-projects';

// Counts only the Projects that are published, because Strapi leaves the others out of the published page.
export const selectedProjectsRule: PublishRule = {
  uids: SECTION_PAGES,
  populate: (uid, strapi) => everySection(strapi, uid, { [SELECTED]: { populate: { projects: true } } }),
  problems: async (_uid, draft, strapi) => {
    const { min, max } = SELECTED_PROJECTS;
    const problems: string[] = [];
    for (const [index, section] of list(draft.sections).entries()) {
      if (section.__component !== SELECTED) continue;
      const projects = list(section.projects);
      const published = await publishedIds(strapi, PROJECT, documentIds(projects), draft.locale as string | undefined);
      if (published.size >= min && published.size <= max) continue;
      const waiting = projects.filter((project) => !published.has(project.documentId as string));
      const unpublished = waiting.length > 0 ? ` Not published yet: ${waiting.map(named).join(', ')}.` : '';
      problems.push(`Section ${index + 1} (Selected Projects) has ${published.size} published Projects, and it needs ${min} to ${max}.${unpublished}`);
    }
    return problems;
  },
};
