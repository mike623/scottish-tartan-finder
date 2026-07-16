/**
 * Fetches a single tartan detail page via the rate-limited HTTP client.
 * Contains only network logic — parsing lives in detail/parser.ts.
 */
import type { HttpClient } from "../http/client.js";
import { REGISTER_BASE_URL } from "../discovery/az.js";

export interface DetailFetchResult {
  ref: number;
  url: string;
  status: number;
  html: string;
}

export function detailUrlFor(ref: number): string {
  return `${REGISTER_BASE_URL}/tartanDetails?ref=${ref}`;
}

export async function fetchDetail(client: HttpClient, ref: number): Promise<DetailFetchResult> {
  const url = detailUrlFor(ref);
  const { status, body } = await client.get(url);
  return { ref, url, status, html: body };
}
