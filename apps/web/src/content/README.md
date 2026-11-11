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
- `rules.json` holds the reserved Page slugs, the Selected Projects bounds, and the route prefixes.
  The CMS repeats them, and its publish-rules and behaviour checks fail when the two differ.
- `populate.json` holds the populate for each kind of request.
  A schema is only valid for a response fetched with its populate, so the queries added in layer 3 must use these.
  A missing populate makes the strict schema fail rather than read as empty content.
- `fixtures/` holds recorded Strapi responses, and `requests.json` lists the request behind each one.
- `testing/` maps each fixture to the schemas that must read it.

## Layer 3: reading content

`queries/` holds every Strapi read and the only place that branches on draft mode.
Pages and components import from `queries/index.ts`, never from a type-specific file.

- `queries/shared.ts` reads lists, singles, and slugs.
  A dropped item is logged, a contract failure throws, and a missing slug returns `null`.
  A list that shows every document, such as Services or Team Members, reads every page of it, so none stops at Strapi's default of 25.
  Every list sorts on a second field, so documents that tie keep the same order.
- `queries/projects.ts`, `services.ts`, `team-members.ts`, `articles.ts`, `pages.ts`, `sections-pages.ts`, `site-settings.ts`, and `references.ts` hold the published and draft reads.
- `queries/mode.ts` reads `draftMode()` outside the cached functions.
  The published branch is cached and the draft branch is not.
- `queries/slug-history.ts` returns the current path for an old one, or `null` when no redirect exists or the target is not published.

Every published query uses `'use cache'` with `cacheLife('max')` and `cacheTag`.
The tags cover the type, each document on the page, and every document shown indirectly, such as a Typology, Service, Credit, Quote speaker, Topic, Byline, or related Project card.
A related Project card that is dropped is still tagged, from the report of what was dropped, so a later fix clears the page that lost it.
A document that is itself dropped from a list or read by slug is covered by the type tag.

## Revalidation

`POST /api/revalidate` takes the Strapi webhook described in `apps/cms/src/webhooks.ts`.
It requires `Authorization: Bearer <REVALIDATE_SECRET>`.

- A content event clears the type tag and the document tag.
  A delete without a document id still clears the type.
- A Slug history event clears the history lookup as well.
- A media event clears every cached content type, because alt text can appear anywhere.
- Repeated events are harmless, and the route expires each tag at once with `{ expire: 0 }`.
  A webhook cannot call `updateTag`, and the `max` profile would serve the old page to the next visitor.

## Preview

`GET /api/preview` takes `url`, `secret`, and `status`, as Strapi's admin sends them.
It checks `PREVIEW_SECRET`, enables draft mode for `status=draft`, disables it for `status=published`, and redirects to `url`.
The redirect only accepts a path on this site.
`next.config.ts` sets `frame-ancestors` to `CMS_ORIGIN`, so only the CMS admin may frame the site.

## Inquiry

`submitInquiry(previous, formData)` is the server action in `inquiry.ts`.
It validates the form with `inquiryInputSchema`, checks the Turnstile token, and creates the Inquiry with the Inquiry token.
It sends the first address in `x-forwarded-for` as `x-visitor-ip`, and falls back to `127.0.0.1` when local development has no forwarded address.

## Rules the Strapi schema cannot enforce

The strict schemas enforce these when the web app reads published content.
The CMS refuses to publish a document that breaks one of them, and refuses to unpublish or delete a document that published pages depend on (`apps/cms/src/publish-rules`), so an Editor is told while editing.
The rule behind both is that the CMS refuses what these strict schemas refuse.
Consent is the exception, because the Inquiry form checks it before anything reaches Strapi.

| Rule | Where |
| --- | --- |
| A Project has a Typology and at least one Service, and a Credit names a Team Member | `schemas/project.ts` |
| An Article has a Topic and at least one Team Member in its Byline | `schemas/article.ts` |
| An Inquiry needs consent to be true | `schemas/inquiry.ts` |
| An image has alt text: `imageAlt` when a Section sets an image, and `alternativeText` on a cover or portrait | `schemas/sections.ts`, `schemas/shared.ts` |
| Selected Projects has three to six Projects | `schemas/sections.ts`, `rules.json` |
| A Page does not use a reserved slug | `schemas/page.ts`, `rules.json` |

Strapi removes an unpublished document from a published relation without a word.
A Credit keeps its place with a null Team Member, so the Credit is dropped.
A Byline or Selected Projects loses the entry, so the Article is refused or the Section dropped only when too few remain.

The publish rules count only related documents that are published, so they see what the published page will hold.

Broken content still reaches the web app in these ways, and the web app drops it when the page is built, as described below:

- Text of only spaces in a required field, such as a title or the alt text of a Block, which Strapi's required check accepts.
- A rich text image node, which Strapi accepts.
- Alt text cleared in the Media Library after the document that uses it was published, because the rules check a document only when it is published.
- Bulk unpublish, which checks each document while the others are still published.
- Anything written around the Document Service, such as a transfer, a seed or a direct database write.

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
The CMS refuses most broken content at publish, so a drop means content arrived in one of the ways listed above, and `dropped` is the only sign of it.
Layer 3 must log every report where someone will see it.
`describeDropped` turns a report into one line.
A schema parsed without `parseContent` sends each drop to `console.error`, so nothing is dropped silently.

Known gaps:

- A Project, Article, Service or Page fetched by slug goes through `collection`, so a broken one comes back as `items: []` and looks like a 404 unless layer 3 checks `dropped`.
- `pagination.total` counts what Strapi returned, so it can be more than `items.length`, and a page of the Journal can show fewer than 12 Articles.
- Deleting a media file used as a cover leaves the cover null, which refuses the document that uses it.
- The CMS counts the published Projects in Selected Projects, while the web app counts the cards left after drops, so a card whose cover lost its alt text later can drop a Section the CMS accepted.
- Site Settings has no fallback, so a broken Site Settings document fails every page.
- Drops are collected synchronously, so a schema must be parsed in one go, as `parseContent` does.

## Recording fixtures

Run `pnpm record:fixtures` from the repository root with Postgres up.
It boots Strapi on a throwaway database, creates documents, and writes the responses into `fixtures/`.
It records valid documents, half-filled drafts, and published documents that break each rule.
The CMS refuses to publish those, so the recorder publishes each one while it is valid and then breaks its published row in the database, as a transfer or a bug could.
It checks that each recorded document is in the state its fixture is named for.
The recorder swaps ids, timestamps, upload hashes and byte sizes for fixed values, so recording an unchanged content type produces no diff.
Re-record when a content type changes, then read the diff, because the diff is the change to the contract.
