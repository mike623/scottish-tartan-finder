// Search index — same as tartans-lite.json plus registration notes (`o`) so the
// search page can match on notes/designer. Kept separate because notes are bulky
// (~1.2MB gzipped) and browse doesn't need them; only /search fetches this.
import { tartans } from '../lib/tartans';

export function GET() {
  const data = tartans.map((t) => ({
    r: t.ref,
    n: t.name,
    c: t.category,
    d: t.designer,
    y: t.tartanDate,
    o: t.registrationNotes,
  }));
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
