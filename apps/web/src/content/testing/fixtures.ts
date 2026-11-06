import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Path = (string | number)[];

const fixturesDir = fileURLToPath(new URL('../fixtures/', import.meta.url));

export const loadFixture = (name: string): Json => JSON.parse(readFileSync(`${fixturesDir}${name}.json`, 'utf8')) as Json;

export const fixtureNames = (): string[] =>
  (JSON.parse(readFileSync(`${fixturesDir}requests.json`, 'utf8')) as { name: string }[]).map((request) => request.name);

export const fixtureFiles = (): string[] =>
  readdirSync(fixturesDir)
    .filter((file) => file.endsWith('.json') && file !== 'requests.json')
    .map((file) => file.replace(/\.json$/, ''));

export const read = (fixture: Json, path: Path): Json =>
  path.reduce<Json>((node, key) => (node as Record<string | number, Json>)[key], fixture);

// Returns a copy with one value replaced, so a test can break a recorded response in exactly one way.
export const change = (fixture: Json, path: Path, value: Json): Json => {
  const copy = structuredClone(fixture);
  const parent = read(copy, path.slice(0, -1)) as Record<string | number, Json>;
  parent[path[path.length - 1]] = value;
  return copy;
};
