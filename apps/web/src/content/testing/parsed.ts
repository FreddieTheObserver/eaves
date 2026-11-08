import type { Dropped, Parsed } from '../schemas';

export const where = (drop: Dropped) => drop.path.map((place) => `${place.what}[${place.index}]`).join(' > ');

export const dropsOf = (result: Parsed<unknown>) => result.dropped.map((drop) => [where(drop), drop.reasons]);

export const valueOf = <T>(result: Parsed<T>): T => {
  if (!result.ok) throw new Error(`Expected content, got ${result.problems.join('; ')}`);
  return result.value;
};
