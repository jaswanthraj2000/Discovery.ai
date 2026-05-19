import type { AccessLevel, Source, SourceCatalog, SourceType } from "@/lib/research-types";
import { sanitizePublicationYear } from "@/lib/literature/pub-year";

type EpmcResult = {
  title?: string;
  authorString?: string;
  journalTitle?: string;
  pubYear?: string;
  doi?: string;
  pmid?: string;
  abstractText?: string;
  isOpenAccess?: string;
  citedByCount?: number;
};

function stripEpmcHtml(s: string): string {
  return s
    .replace(/<sup>[^<]*<\/sup>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type EpmcResponse = { resultList?: { result?: EpmcResult[] } };

function mapEpmcAccess(r: EpmcResult): AccessLevel {
  const oa = (r.isOpenAccess ?? "N").toUpperCase();
  if (oa === "Y") return "open-access";
  return "abstract";
}

function mapEpmcType(_r: EpmcResult): SourceType {
  return "journal";
}

function epmcUrl(r: EpmcResult): string {
  if (r.doi) return `https://doi.org/${r.doi}`;
  if (r.pmid) return `https://europepmc.org/article/MED/${r.pmid}`;
  return "https://europepmc.org";
}

export function mapEpmcResultToSource(r: EpmcResult, index: number, idOffset: number): Source {
  const access = mapEpmcAccess(r);
  const { year, suspect } = sanitizePublicationYear(r.pubYear);
  const rawAbs = r.abstractText?.trim();
  const abstractText =
    rawAbs && rawAbs.length > 40 ? stripEpmcHtml(rawAbs).slice(0, 12_000) : undefined;
  return {
    id: idOffset + index + 1,
    title: (r.title ?? "Untitled").replace(/\s*<[^>]+>/g, ""),
    authors: r.authorString ?? "Unknown authors",
    venue: r.journalTitle ?? "Europe PMC",
    source: "Europe PMC" as SourceCatalog,
    type: mapEpmcType(r),
    year,
    ...(suspect ? { pubYearSuspect: true } : {}),
    access,
    doi: r.doi,
    ...(r.pmid ? { pmid: r.pmid } : {}),
    url: epmcUrl(r),
    ...(abstractText ? { abstractText } : {}),
    evidence: "unspecified",
  };
}

/**
 * Fetch abstract text from Europe PMC by DOI (normalized, no https://doi.org/ prefix).
 */
export async function fetchEuropePmcAbstractByDoi(doi: string): Promise<string | null> {
  const normalized = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim();
  if (normalized.length < 6) return null;

  const url = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
  url.searchParams.set("query", `DOI:${normalized}`);
  url.searchParams.set("format", "json");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("resultType", "core");

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const data = (await res.json()) as EpmcResponse;
  const raw = data.resultList?.result ?? [];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const r = list[0];
  const text = r?.abstractText?.trim();
  if (!text || text.length < 40) return null;
  return stripEpmcHtml(text).slice(0, 12_000);
}

/** MED / PubMed id via Europe PMC search (core record includes abstractText). */
export async function fetchEuropePmcAbstractByPmid(pmid: string): Promise<string | null> {
  const id = pmid.replace(/\D/g, "");
  if (id.length < 5) return null;

  const url = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
  url.searchParams.set("query", `SRC:MED AND EXT_ID:${id}`);
  url.searchParams.set("format", "json");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("resultType", "core");

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const data = (await res.json()) as EpmcResponse;
  const raw = data.resultList?.result ?? [];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const r = list[0];
  const text = r?.abstractText?.trim();
  if (!text || text.length < 40) return null;
  return stripEpmcHtml(text).slice(0, 12_000);
}

export async function fetchEuropePmcResults(query: string, pageSize = 15): Promise<Source[]> {
  const q = query.trim();
  if (!q) return [];

  const url = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
  url.searchParams.set("query", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("resultType", "core");

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Europe PMC request failed (${res.status})`);
  }
  const data = (await res.json()) as EpmcResponse;
  const raw = data.resultList?.result ?? [];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map((r, i) => mapEpmcResultToSource(r, i, 1000));
}
