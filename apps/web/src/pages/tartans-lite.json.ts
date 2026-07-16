// Build-time endpoint → emits a compact catalogue index the client fetches for
// the search/browse lists (instead of server-rendering all 10,822 cards into
// ~16MB of HTML). Short keys keep it small; the image URL is derived from `r`.
import { tartans } from '../lib/tartans';

export function GET() {
  const lite = tartans.map((t) => ({
    r: t.ref,
    n: t.name,
    c: t.category,
    d: t.designer,
    y: t.tartanDate,
  }));
  return new Response(JSON.stringify(lite), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
