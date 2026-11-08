# Seed content

The versioned sample content that `pnpm seed` loads into an empty CMS.
It feeds local development, CI, and the first production load, and it never runs against production again after launch.

## What is here

- The JSON files hold structure: fields, relations by slug (or by `key` for Team Members), and image filenames.
- `bodies/` holds the prose of each Project, Service, Article, and Page, in one Markdown file per slug.
- `images.json` lists every image once, with its alt text and aspect ratio.
- `images/` holds the image files.

## Editing the copy

Write one sentence per line, because the lines of a paragraph are joined when the seed loads.
Bodies can use `## Headings`, `- lists`, `**bold**`, `*italic*`, and `[links](/path)`.
A line starting with `@` adds a Block that is not text:

```text
@image file.jpg | Optional caption
@pair left.jpg | right.jpg
@gallery first.jpg | second.jpg | third.jpg
@quote team-member-key | The words they said.
@drawing plan | file.jpg | Required caption
```

A drawing is a `plan`, a `section`, or an `elevation`.

`pnpm test` checks these files against section 14 of the design document and ADR 0002.
`pnpm check:seed` loads them into a throwaway database and reads them back through the web app's schemas.

## Replacing the placeholders

Every file in `images/` is a solid-colour placeholder until the Figma pass chooses the image tool.
`images.json` doubles as the brief, because each entry describes the scene the final image should show.
Replace a placeholder by saving the final image under the same filename, with its long edge at least 1000 pixels.
Final files must carry the IPTC marker for AI-generated media, and every placeholder must be replaced before the first production load.

## Starting again locally

`pnpm seed` refuses a CMS that already holds content.
To reload it, run `docker compose down -v`, which deletes the local database and bucket, then `pnpm docker:up` and `pnpm seed`.
