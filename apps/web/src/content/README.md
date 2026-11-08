# Content module

The only code in the web app that knows Strapi exists.
Pages and components import the types from `types.ts` and never see a Strapi response.

## What is here

- `types.ts` holds the domain types.
  Every `id` is the Strapi documentId, because cache tags and slug redirects are keyed by it.
  `Draft<T>` is the shape a half-filled draft can have.
- `schemas/` holds one strict and one lenient zod schema per content type.
  The strict schema reads published content and refuses a document that breaks a content rule.
  The lenient schema reads a draft and refuses nothing a draft can legitimately lack.
  Both turn the Strapi response into the domain type.
- `schemas/tolerance.ts` keeps one broken item from taking down the page that shows it, as described below.
- `populate.json` holds the populate for each kind of request.
  A schema is only valid for a response fetched with its populate, so the queries added in layer 3 must use these.
  A missing populate makes the strict schema fail rather than read as empty content.
- `fixtures/` holds recorded Strapi responses, and `requests.json` lists the request behind each one.
- `testing/` maps each fixture to the schemas that must read it.

## Rules the Strapi schema cannot enforce

The strict schemas enforce these when the web app reads published content.
The CMS also refuses to publish a missing alt text, and refuses to unpublish or delete a document that published pages depend on (`apps/cms/src/publish-rules`), so an Editor is told while editing.
The rule behind both is that the CMS refuses what these strict schemas refuse.
Nothing stops an Editor publishing a document that breaks any other rule, so the web app finds it when the page is built and drops it, as described below.

| Rule | Where |
| --- | --- |
| A Project has a Typology and at least one Service, and a Credit names a Team Member | `schemas/project.ts` |
| An Article has a Topic and at least one Team Member in its Byline | `schemas/article.ts` |
| An Inquiry needs consent to be true | `schemas/inquiry.ts` |
| An image has alt text: `imageAlt` when a Section sets an image, and `alternativeText` on a cover or portrait | `schemas/sections.ts`, `schemas/shared.ts` |
| Selected Projects has three to six Projects | `schemas/sections.ts` |
| A Page does not use a reserved slug | `schemas/page.ts` |

Strapi removes an unpublished document from a published relation without a word.
A Credit keeps its place with a null Team Member, so the Credit is dropped.
A Byline or Selected Projects loses the entry, so the Article is refused or the Section dropped only when too few remain.

The publish rule checks a document when it is published.
Clearing the alt text of a file in the Media Library afterwards leaves the cover published without it, and the strict schema then refuses that document.

## When published content breaks a rule

Read published content with `parseContent(schema, response)`, which never throws.
It returns `{ ok: true, value, dropped }`, or `{ ok: false, problems, dropped }` when the response cannot be read at all.

An item that breaks a rule is dropped from its list and reported in `dropped`.
The lists that drop items are the documents in a `collection`, Credits, Blocks, Sections, related Projects, Selected Projects cards, and the Site Settings links.
Selected Projects counts its cards after the broken ones are dropped, and is dropped as a whole when fewer than three remain.
A dropped item keeps the items dropped inside it as its `causes`, so the broken card is still named when it is the reason the Section went.

A rule on a document's own fields, such as its Typology, Services, Topic, Byline, slug or cover, refuses that whole document.
In a `collection` the document is dropped.
Read with `single`, as Site Settings and the Home and Studio pages are, the response fails.

Only what an Editor can cause is dropped: a null relation or field, empty text or an empty list, a failed pattern, a count rule, or rich text the web app refuses.
A missing key, a value of the wrong type, or a component or option the web app does not know fails the whole response, because it means the query or the deployed web app is wrong.
That is what keeps a missing populate from passing as empty content.

Dropping makes a loud failure quiet.
Until the CMS refuses to publish everything these strict schemas refuse, `dropped` is the only sign that published content is broken, so layer 3 must log every report where someone will see it.
`describeDropped` turns a report into one line.
A schema parsed without `parseContent` sends each drop to `console.error`, so nothing is dropped silently.

Known gaps:

- A Project, Article, Service or Page fetched by slug goes through `collection`, so a broken one comes back as `items: []` and looks like a 404 unless layer 3 checks `dropped`.
- `pagination.total` counts what Strapi returned, so it can be more than `items.length`, and a page of the Journal can show fewer than 12 Articles.
- Deleting a media file used as a cover leaves the cover null, which refuses the document that uses it.
- Site Settings has no fallback, so a broken Site Settings document fails every page.
- Drops are collected synchronously, so a schema must be parsed in one go, as `parseContent` does.

## Recording fixtures

Run `pnpm record:fixtures` from the repository root with Postgres up.
It boots Strapi on a throwaway database, creates documents, and writes the responses into `fixtures/`.
It records valid documents, half-filled drafts, and published documents that break each rule, and it checks that Strapi accepts those.
The recorder swaps ids, timestamps, upload hashes and byte sizes for fixed values, so recording an unchanged content type produces no diff.
Re-record when a content type changes, then read the diff, because the diff is the change to the contract.
