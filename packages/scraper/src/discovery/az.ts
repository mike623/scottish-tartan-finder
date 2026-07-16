/**
 * A-Z discovery provider.
 *
 * Fetches `https://www.tartanregister.gov.uk/az?searchString=<L>` (the real,
 * canonical URL confirmed by live investigation — `az.aspx?searchString=<L>`
 * 301-redirects to this path; see docs/source-investigation.md). The page
 * lists every tartan whose name starts with the given letter in a single
 * unpaginated HTML table: no "next page" link was observed even for letter
 * "A" (518 results).
 */
import * as cheerio from "cheerio";
import type { HttpClient } from "../http/client.js";

export interface DiscoveredTartan {
  ref: number;
  name: string;
  detailUrl: string;
  discoveryUrl: string;
}

export interface DiscoveryProvider {
  discover(): AsyncIterable<DiscoveredTartan>;
}

export const REGISTER_BASE_URL = "https://www.tartanregister.gov.uk";

const REF_LINK_SELECTOR = 'a[href*="tartanDetails.aspx?ref="], a[href*="tartanDetails?ref="]';

/** Discovers tartan references via the Register's A-Z browse pages. */
export class AzDiscoveryProvider implements DiscoveryProvider {
  constructor(
    private readonly client: HttpClient,
    private readonly letters: string[] = ["A"],
  ) {}

  async *discover(): AsyncIterable<DiscoveredTartan> {
    const seen = new Set<number>();

    for (const letter of this.letters) {
      const discoveryUrl = `${REGISTER_BASE_URL}/az?searchString=${encodeURIComponent(letter)}`;
      const { body, status } = await this.client.get(discoveryUrl);
      if (status !== 200) {
        continue;
      }

      for (const tartan of parseAzListing(body, discoveryUrl)) {
        if (seen.has(tartan.ref)) continue;
        seen.add(tartan.ref);
        yield tartan;
      }
    }
  }
}

/** Pure parsing helper — no network logic — kept exported for unit testing. */
export function parseAzListing(html: string, discoveryUrl: string): DiscoveredTartan[] {
  const $ = cheerio.load(html);
  const results: DiscoveredTartan[] = [];
  const seen = new Set<number>();

  $(REF_LINK_SELECTOR).each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const match = href.match(/ref=(\d+)/);
    if (!match) return;
    const ref = Number(match[1]);
    if (seen.has(ref)) return;
    seen.add(ref);

    const name = $(el).text().trim();
    results.push({
      ref,
      name,
      detailUrl: `${REGISTER_BASE_URL}/tartanDetails?ref=${ref}`,
      discoveryUrl,
    });
  });

  return results;
}
