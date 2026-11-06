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
- `populate.json` holds the populate for each kind of request.
  A schema is only valid for a response fetched with its populate, so the queries added in layer 3 must use these.
  A missing populate makes the strict schema fail rather than read as empty content.
- `fixtures/` holds recorded Strapi responses, and `requests.json` lists the request behind each one.
- `testing/` maps each fixture to the schemas that must read it.

## Rules the Strapi schema cannot enforce

The strict schemas enforce these when the web app reads published content.
The CMS also refuses to publish a missing alt text (`apps/cms/src/publish-rules`), so an Editor is told while editing.
Nothing stops an Editor publishing a document that breaks any other rule, so a failure shows up when the page is built.

| Rule | Where |
| --- | --- |
| A Project has a Typology and at least one Service, and a Credit names a Team Member | `schemas/project.ts` |
| An Article has a Topic and at least one Team Member in its Byline | `schemas/article.ts` |
| An Inquiry needs consent to be true | `schemas/inquiry.ts` |
| An image has alt text: `imageAlt` when a Section sets an image, and `alternativeText` on a cover or portrait | `schemas/sections.ts`, `schemas/shared.ts` |
| Selected Projects has three to six Projects | `schemas/sections.ts` |
| A Page does not use a reserved slug | `schemas/page.ts` |

Strapi removes an unpublished document from a published relation without a word.
A Credit keeps its place with a null Team Member, so the Project is refused.
A Byline or Selected Projects loses the entry, so it is refused only when too few remain.

The publish rule checks a document when it is published.
Clearing the alt text of a file in the Media Library afterwards leaves the cover published without it, and the strict schema is what then refuses the page.

## Recording fixtures

Run `pnpm record:fixtures` from the repository root with Postgres up.
It boots Strapi on a throwaway database, creates documents, and writes the responses into `fixtures/`.
It records valid documents, half-filled drafts, and published documents that break each rule, and it checks that Strapi accepts those.
The recorder swaps ids, timestamps, upload hashes and byte sizes for fixed values, so recording an unchanged content type produces no diff.
Re-record when a content type changes, then read the diff, because the diff is the change to the contract.
