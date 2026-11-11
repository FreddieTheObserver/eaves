import { describe, expect, it } from 'vitest';
import { UIDS } from './catalog';
import { collection, parseContent, projectSchema } from './schemas';
import { documentTag, listCacheTags, projectCacheTags, typeTag } from './tags';
import { loadFixture } from './testing/fixtures';
import { valueOf } from './testing/parsed';

const project = valueOf(parseContent(collection(projectSchema, 'Project'), loadFixture('project-published'))).items[0];

describe('cache tags', () => {
  it('tags a Project with its own document and every document it displays', () => {
    const tags = projectCacheTags(project);
    expect(tags).toContain(documentTag(UIDS.project, project.id));
    expect(tags).toContain(documentTag(UIDS.typology, project.typology.id));
    for (const service of project.services) expect(tags).toContain(documentTag(UIDS.service, service.id));
    for (const credit of project.credits) expect(tags).toContain(documentTag(UIDS.teamMember, credit.teamMember.id));
  });

  it('adds the content type tag to a list', () => {
    expect(listCacheTags(UIDS.project, [project], projectCacheTags)).toContain(typeTag(UIDS.project));
  });
});
