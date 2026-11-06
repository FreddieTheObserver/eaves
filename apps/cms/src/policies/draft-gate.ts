import { TOKEN_NAMES } from '../access/constants';

// Strapi builds the policy context with Object.assign over the Koa context, which drops prototype
// getters such as query, so the query string is read from request. state is missing from its type.
type DraftGateContext = {
  request?: { query?: { status?: unknown } };
  state?: { auth?: { credentials?: { name?: string } } };
};

// Strapi lets any token that can find content read drafts with ?status=draft.
// Only the Draft token may ask for anything other than published content.
const draftGate = (policyContext: DraftGateContext) => {
  const status = policyContext.request?.query?.status;
  if (status === undefined || status === 'published') return true;

  return policyContext.state?.auth?.credentials?.name === TOKEN_NAMES.draft;
};

export default draftGate;
