/**
 * "What's New" discovery — the Register's recent-registrations feed.
 *
 * `https://www.tartanregister.gov.uk/whatsNew` lists the ~20 most recently
 * registered tartans as `tartanDetails.aspx?ref=…` links (confirmed live; see
 * docs/source-investigation.md). One request returns the newest refs, which
 * makes routine incremental sync nearly free: fetch this page, diff the refs
 * against the local index, and only detail-fetch the ones you don't have yet.
 *
 * Reuses the same link-parsing as the A-Z pages.
 */
import type { HttpClient } from "../http/client.js";
import { parseAzListing, REGISTER_BASE_URL, type DiscoveredTartan } from "./az.js";

export const WHATS_NEW_URL = `${REGISTER_BASE_URL}/whatsNew`;

/** Fetch the recent-registrations feed and return the discovered tartans. */
export async function discoverWhatsNew(client: HttpClient): Promise<DiscoveredTartan[]> {
  const { body, status } = await client.get(WHATS_NEW_URL);
  if (status !== 200) return [];
  return parseAzListing(body, WHATS_NEW_URL);
}
