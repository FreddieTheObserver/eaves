import Image from 'next/image';
import type { ReactNode } from 'react';
import type {
  Block,
  Draft,
  Figure,
  Image as ContentImage,
  ProjectDraft,
  RichText,
  RichTextInline,
  RichTextList,
} from '@/content/types';

function Picture({ image }: { image?: Draft<ContentImage> }) {
  if (!image?.url || !image.width || !image.height) return null;
  return <Image src={image.url} width={image.width} height={image.height} alt={image.alt ?? ''} />;
}

function FigureView({ figure }: { figure?: Draft<Figure> }) {
  if (!figure?.image) return null;
  return (
    <figure>
      <Picture image={figure.image} />
      {figure.caption ? <figcaption>{figure.caption}</figcaption> : null}
    </figure>
  );
}

function Inline({ node }: { node: RichTextInline }) {
  if (node.type === 'link') {
    return (
      <a href={node.url}>
        <Inlines nodes={node.children} />
      </a>
    );
  }

  let content: ReactNode = node.text;
  if (node.code) content = <code>{content}</code>;
  if (node.bold) content = <strong>{content}</strong>;
  if (node.italic) content = <em>{content}</em>;
  if (node.underline) content = <u>{content}</u>;
  if (node.strikethrough) content = <s>{content}</s>;
  return <>{content}</>;
}

function Inlines({ nodes }: { nodes: RichTextInline[] }) {
  return nodes.map((node, index) => <Inline key={index} node={node} />);
}

function ListView({ list }: { list: RichTextList }) {
  const Tag = list.format === 'ordered' ? 'ol' : 'ul';
  return (
    <Tag>
      {list.children.map((item, index) => (
        <li key={index}>{item.type === 'list' ? <ListView list={item} /> : <Inlines nodes={item.children} />}</li>
      ))}
    </Tag>
  );
}

function RichTextView({ nodes }: { nodes: RichText }) {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'paragraph':
        return (
          <p key={index}>
            <Inlines nodes={node.children} />
          </p>
        );
      case 'heading': {
        const Heading = `h${node.level}` as const;
        return (
          <Heading key={index}>
            <Inlines nodes={node.children} />
          </Heading>
        );
      }
      case 'quote':
        return (
          <blockquote key={index}>
            <Inlines nodes={node.children} />
          </blockquote>
        );
      case 'code':
        return (
          <pre key={index}>
            <code>
              <Inlines nodes={node.children} />
            </code>
          </pre>
        );
      case 'list':
        return <ListView key={index} list={node} />;
    }
  });
}

function BlockView({ block }: { block: Draft<Block> }) {
  switch (block.type) {
    case 'text':
      return <RichTextView nodes={block.body} />;
    case 'image':
      return (
        <figure>
          <Picture image={block.image} />
          {block.caption ? <figcaption>{block.caption}</figcaption> : null}
        </figure>
      );
    case 'imagePair':
      return (
        <div>
          <FigureView figure={block.left} />
          <FigureView figure={block.right} />
        </div>
      );
    case 'gallery':
      return (
        <div>
          {block.items.map((item, index) => (
            <FigureView key={index} figure={item} />
          ))}
        </div>
      );
    case 'quote':
      return (
        <figure>
          <blockquote>
            <p>{block.text}</p>
          </blockquote>
          {block.speaker?.name ? (
            <figcaption>
              {block.speaker.name}
              {block.speaker.position ? `, ${block.speaker.position}` : ''}
            </figcaption>
          ) : null}
        </figure>
      );
    case 'drawing':
      return (
        <figure>
          <Picture image={block.image} />
          <figcaption>
            {block.kind ? `${block.kind}: ` : ''}
            {block.caption}
          </figcaption>
        </figure>
      );
  }
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </>
  );
}

export function PlainProject({ project }: { project: ProjectDraft }) {
  const { title, summary, cover, typology, location, year, stage, floorArea, services, credits, body } = project;

  return (
    <main>
      <article>
        <header>
          <h1>{title}</h1>
          {summary ? <p>{summary}</p> : null}
          <Picture image={cover} />
        </header>

        <dl>
          {typology?.name ? <Fact term="Typology">{typology.name}</Fact> : null}
          {location?.neighbourhood || location?.city ? (
            <Fact term="Location">{[location.neighbourhood, location.city].filter(Boolean).join(', ')}</Fact>
          ) : null}
          {year ? <Fact term="Year">{year}</Fact> : null}
          {stage ? <Fact term="Stage">{stage.replace('_', ' ')}</Fact> : null}
          {floorArea ? <Fact term="Floor area">{floorArea} m²</Fact> : null}
          {services.length > 0 ? (
            <Fact term="Services">{services.map((service) => service.name).filter(Boolean).join(', ')}</Fact>
          ) : null}
        </dl>

        {credits.length > 0 ? (
          <section>
            <h2>Credits</h2>
            <ul>
              {credits.map((credit, index) => (
                <li key={index}>
                  {[credit.teamMember?.name, credit.role].filter(Boolean).join(', ')}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {body.map((block, index) => (
          <BlockView key={index} block={block} />
        ))}
      </article>
    </main>
  );
}
