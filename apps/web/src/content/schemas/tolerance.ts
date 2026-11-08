import { z } from 'zod';

// Where a dropped item sat: the kind of item, its position in its list, and the documentId of a document
// or the component name of a Block or Section.
export type Place = { what: string; index: number; id?: string };

// path runs from the outermost list down to the dropped item. causes are the items inside it that were
// dropped first, which can be why it broke, as when a Selected Projects Section loses a card and falls
// below three.
export type Dropped = { path: Place[]; reasons: string[]; causes: Dropped[] };

export type Parsed<T> = { ok: true; value: T; dropped: Dropped[] } | { ok: false; problems: string[]; dropped: Dropped[] };

let scope: Dropped[] | undefined;

const placeText = (place: Place) => `${place.what}[${place.index}]${place.id ? ` (${place.id})` : ''}`;

export const describeDropped = (drop: Dropped): string => {
  const text = `${drop.path.map(placeText).join(' > ')}: ${drop.reasons.join('; ')}`;
  return drop.causes.length ? `${text} (after dropping ${drop.causes.map(describeDropped).join(', ')})` : text;
};

const report = (drop: Dropped) => {
  if (scope) scope.push(drop);
  else console.error(`Dropped ${describeDropped(drop)}`);
};

// Synchronous on purpose: zod parses synchronously, and one module-level scope is only safe while nothing
// awaits inside it.
export const collectDropped = <T>(run: () => T): { value: T; dropped: Dropped[] } => {
  const outer = scope;
  const dropped: Dropped[] = [];
  scope = dropped;
  try {
    const value = run();
    if (value instanceof Promise) throw new Error('collectDropped cannot collect from asynchronous work');
    return { value, dropped };
  } finally {
    scope = outer;
  }
};

// An Editor can cause these: a null relation or field, empty text or an empty list, a failed pattern or
// count rule, or rich text the web app refuses. Anything else, such as a key the query did not populate,
// a value of the wrong type, or a component or option the web app does not know, means the query or the
// deployed web app is wrong, so it fails the whole response instead of quietly emptying a page.
const isContentIssue = (issue: z.core.$ZodIssue): boolean => {
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === null;
    case 'invalid_union':
      return issue.discriminator === undefined;
    case 'too_small':
    case 'too_big':
    case 'invalid_format':
    case 'custom':
      return true;
    default:
      return false;
  }
};

const reason = (issue: z.core.$ZodIssue) => (issue.path.length ? `${issue.path.map(String).join('.')}: ${issue.message}` : issue.message);

const idOf = (value: unknown) => {
  if (!value || typeof value !== 'object') return {};
  const { documentId, __component } = value as Record<string, unknown>;
  if (typeof documentId === 'string') return { id: documentId };
  if (typeof __component === 'string') return { id: __component };
  return {};
};

const within = (place: Place, drop: Dropped): Dropped => ({
  path: [place, ...drop.path],
  reasons: drop.reasons,
  causes: drop.causes.map((cause) => within(place, cause)),
});

// A list that drops an item broken by its content and reports it, so one bad item does not take down
// the page that shows it.
export const tolerantList = <T extends z.ZodType>(what: string, item: T) =>
  z.array(z.unknown()).transform((values, ctx) => {
    const kept: z.output<T>[] = [];
    values.forEach((value, index) => {
      const place: Place = { what, index, ...idOf(value) };
      // reportInput keeps the input on each issue, which is how a missing key is told from a null one.
      const { value: result, dropped } = collectDropped(() => item.safeParse(value, { reportInput: true }));
      const nested = dropped.map((drop) => within(place, drop));
      if (result.success) {
        kept.push(result.data);
        nested.forEach(report);
      } else if (result.error.issues.every(isContentIssue)) {
        report({ path: [place], reasons: result.error.issues.map(reason), causes: nested });
      } else {
        nested.forEach(report);
        for (const issue of result.error.issues) ctx.issues.push({ ...issue, path: [index, ...issue.path] } as z.core.$ZodRawIssue);
      }
    });
    return kept;
  });

export const parseContent = <T extends z.ZodType>(schema: T, input: unknown): Parsed<z.output<T>> => {
  const { value: result, dropped } = collectDropped(() => schema.safeParse(input));
  return result.success ? { ok: true, value: result.data, dropped } : { ok: false, problems: result.error.issues.map(reason), dropped };
};
