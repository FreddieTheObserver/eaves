import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';
import { pathOf } from '@/content/catalog';
import { getProject, getSlugRedirect } from '@/content/queries';
import { PlainProject } from './plain-project';

async function ProjectView({ params }: Pick<PageProps<'/projects/[slug]'>, 'params'>) {
  const { slug } = await params;

  const project = await getProject(slug);
  if (project) return <PlainProject project={project} />;

  const moved = await getSlugRedirect(pathOf('project', slug));
  if (moved) permanentRedirect(moved);
  notFound();
}

// Awaiting params and reading content both happen inside the boundary, so the build prerenders only the
// shell and needs no running CMS.
export default function ProjectPage(props: PageProps<'/projects/[slug]'>) {
  return (
    <Suspense fallback={<p>Loading project</p>}>
      <ProjectView params={props.params} />
    </Suspense>
  );
}
