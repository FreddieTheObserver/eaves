import 'server-only';
import { describeDropped, type Dropped } from './schemas';

// A drop is content the CMS accepted but the web app refuses, so it is
// the only sign that content arrived around the published rules. Log every one
// where someone will see it.
export const reportDropped = (where: string, dropped: Dropped[]): void => {
  for (const drop of dropped) console.error(`[content] ${where}: dropped ${describeDropped(drop)}`);
};
