import type { AccessLevel, Source, SourceCatalog, SourceType } from "@/lib/research-types";
import { sanitizePublicationYear } from "@/lib/literature/pub-year";

type OpenAlexAuthorship = { author?: { display_name?: string } };
type OpenAlexLocation = {
  source?: { display_name?: string };
  landing_page_url?: string;
};

type OpenAlexWork = {
  id: string;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  primary_location?: OpenAlexLocation | null;
  best_oa_location?: OpenAlexLocation | null;
  authorships?: OpenAlexAuthorship[];
  doi?: string | null;
  ids?: { doi?: string };
  open_access?: { is_oa?: boolean; oa_status?: string };
  type?: string | null;
};

type OpenAlexResponse = { results?: OpenAlexWork[] };

function workTitle(w: OpenAlexWork): string {
  return (w.title ?? w.display_name ?? "Untitled work").trim();
}

function workYear(w: OpenAlexWork): { year: number; suspect: boolean } {
  return sanitizePublicationYear(w.publication_year ?? undefined);
}

function workVenue(w: OpenAlexWork): string {
  return w.primary_location?.source?.display_name ?? "Unknown venue";
}

function workUrl(w: OpenAlexWork): string {
  const landing = w.best_oa_location?.landing_page_url ?? w.primary_location?.landing_page_url;
  if (landing) return landing;
  const doi = w.doi ?? w.ids?.doi;
  if (doi) return doi.startsWith("http") ? doi : `https://doi.org/${doi.replace(/^https?:\/\/doi\.org\//, "")}`;
  return w.id.replace("https://", "https://openalex.org/");
}

function workAuthors(w: OpenAlexWork): string {
  const names = (w.authorships ?? [])
    .map((a) => a.author?.display_name)
    .filter(Boolean)
    .slice(0, 6) as string[];
  if (names.length === 0) return "Unknown authors";
  const tail = (w.authorships?.length ?? 0) > 6 ? ", et al." : "";
  return names.join(", ") + tail;
}

function mapOpenAlexType(t: string | null | undefined): SourceType {
  const v = (t ?? "").toLowerCase();
  if (v.includes("preprint")) return "preprint";
  if (v === "dataset") return "dataset";
  if (v.includes("trial")) return "trial";
  return "journal";
}

function mapAccessOnly(w: OpenAlexWork): AccessLevel {
  const oa = w.open_access;
  const status = (oa?.oa_status ?? "").toLowerCase();
  if (oa?.is_oa && status !== "closed") return "open-access";
  if (status === "bronze" || status === "hybrid") return "abstract";
  if (!oa?.is_oa) return "metadata-only";
  return "abstract";
}

export function mapOpenAlexWorkToSource(w: OpenAlexWork, index: number): Source {
  const access = mapAccessOnly(w);
  const doiRaw = w.doi ?? w.ids?.doi;
  const doi = doiRaw ? doiRaw.replace("https://doi.org/", "") : undefined;
  const { year, suspect } = workYear(w);

  return {
    id: index + 1,
    title: workTitle(w),
    authors: workAuthors(w),
    venue: workVenue(w),
    source: "OpenAlex" as SourceCatalog,
    type: mapOpenAlexType(w.type),
    year,
    ...(suspect ? { pubYearSuspect: true } : {}),
    access: access as AccessLevel,
    doi,
    url: workUrl(w),
    evidence: "unspecified",
  };
}

export async function fetchOpenAlexWorks(query: string, perPage = 20): Promise<Source[]> {
  const q = query.trim();
  if (!q) return [];

  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", q);
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("mailto", "discovery-os@users.noreply.github.com");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`OpenAlex request failed (${res.status})`);
  }
  const data = (await res.json()) as OpenAlexResponse;
  const results = data.results ?? [];
  return results.map((w, i) => mapOpenAlexWorkToSource(w, i));
}
