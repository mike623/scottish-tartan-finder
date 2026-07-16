/**
 * Tartan detail page parser.
 *
 * Pure DOM extraction — no network logic — so it can be unit tested against
 * saved HTML fixtures (see test/parser.test.ts and PRD §27-28).
 *
 * Real detail pages (confirmed via live investigation against
 * tartanDetails?ref=14598 — see docs/source-investigation.md) render a label
 * cell followed by a value cell for each field:
 *
 *   <tr><td class="bold">Designer:</td><td><span id="lblDesigner"> ... </span></td></tr>
 *
 * We match on the *label text*, not the ASP.NET control id, so the parser
 * tolerates re-ordering, extra rows, and (within reason) markup changes —
 * per PRD §9's tolerance requirements.
 */
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { REGISTER_BASE_URL } from "../discovery/az.js";

export interface ParsedTartan {
  ref: number;
  name: string;
  designer: string;
  tartanDate: string;
  registrationDate: string;
  category: string;
  restrictions: string;
  registrationNotes: string;
  detailUrl: string;
  imageUrl: string;
}

type LabelField = "designer" | "tartanDate" | "registrationDate" | "category" | "restrictions" | "registrationNotes";

const LABEL_MAP: Record<string, LabelField> = {
  "designer:": "designer",
  "tartan date:": "tartanDate",
  "registration date:": "registrationDate",
  "category:": "category",
  "restrictions:": "restrictions",
  "registration notes:": "registrationNotes",
};

/** Parse a tartan detail page for the given reference id. */
export function parse(ref: number, html: string): ParsedTartan {
  const $ = cheerio.load(html);

  const result: ParsedTartan = {
    ref,
    name: extractName($),
    designer: "",
    tartanDate: "",
    registrationDate: "",
    category: "",
    restrictions: "",
    registrationNotes: "",
    detailUrl: `${REGISTER_BASE_URL}/tartanDetails?ref=${ref}`,
    imageUrl: extractImageUrl($, ref),
  };

  $("table tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;

    const labelCell = $(cells[0]);
    const label = collapseWhitespace(labelCell.text()).toLowerCase();
    const field = LABEL_MAP[label];
    if (!field) return;

    const valueCell = $(cells[1]).clone();
    // Multi-line values use <br> instead of separate rows; turn each break
    // into a space so lines don't run together once text() strips markup.
    valueCell.find("br").replaceWith(" ");
    result[field] = collapseWhitespace(valueCell.text());
  });

  return result;
}

function extractName($: CheerioAPI): string {
  const header = collapseWhitespace($("#lblHeader").text());
  const afterDash = header.match(/-\s*(.+)$/);
  if (afterDash?.[1]) return afterDash[1].trim();

  const breadcrumb = collapseWhitespace($("#lblYouAreIn").text());
  return breadcrumb;
}

function extractImageUrl($: CheerioAPI, ref: number): string {
  const src = $("#imgTartan").attr("src");
  if (!src) {
    return `${REGISTER_BASE_URL}/imageCreation.aspx?height=750&ref=${ref}&width=750`;
  }
  try {
    const url = new URL(src, REGISTER_BASE_URL);
    const height = url.searchParams.get("height") ?? "750";
    const width = url.searchParams.get("width") ?? "750";
    const refParam = url.searchParams.get("ref") ?? String(ref);
    return `${REGISTER_BASE_URL}/imageCreation.aspx?height=${height}&ref=${refParam}&width=${width}`;
  } catch {
    return `${REGISTER_BASE_URL}/imageCreation.aspx?height=750&ref=${ref}&width=750`;
  }
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
