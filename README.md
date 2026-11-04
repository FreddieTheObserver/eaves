# Eaves

Eaves is a fictional architectural and interior design studio in Bangkok.
This repository holds its website and CMS, built as a portfolio piece.
Nothing on the site describes real clients, real projects, real people, professional licences, or real contact details.

## Status

Early work in progress.
Layer 0 (foundations) is done: the workspace, both app scaffolds, local infrastructure, and CI.
The full build plan is in [section 15 of the design document](docs/DESIGN.md#15-build-plan).

## Stack

- Web: Next.js 16 (App Router), React, TypeScript, Tailwind CSS 4
- CMS: Strapi 5 Community Edition
- Database: PostgreSQL
- Media: MinIO locally, Cloudflare R2 in production
- Tooling: pnpm workspace, Docker Compose, GitHub Actions

## Running locally

You need Docker, the Node version in `.nvmrc`, and pnpm 10.

1. Install dependencies with `pnpm install`.
2. Copy `apps/cms/.env.example` to `apps/cms/.env` and replace the placeholder secrets with random values.
3. Start Postgres and MinIO with `pnpm docker:up`.
4. Start both apps with `pnpm dev`.

The web app runs at http://localhost:3000.
The Strapi admin runs at http://localhost:1337/admin.

`pnpm lint`, `pnpm typecheck`, and `pnpm build` run the same checks as CI.

## Documentation

- [Design document](docs/DESIGN.md): how the site and CMS are built and run.
- [Architecture decisions](docs/adr): the three decisions most likely to surprise a reader.
- [Glossary](GLOSSARY.md): the domain language used across the code and docs.

## Licence

The code is released under the [MIT licence](LICENSE).
The Eaves name, its written copy, and its images are not covered by that licence and may not be reused.
