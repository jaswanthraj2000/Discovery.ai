import type { Entity, KeyFinding, Source } from "@/lib/research-types";
import { fetchEuropePmcResults } from "@/lib/literature/europepmc";
import { fetchOpenAlexWorks } from "@/lib/literature/openalex";
import {
  abstractRescoreTopNFromEnv,
  applyAbstractEvidenceRescore,
} from "@/lib/literature/abstract-rescore";
import { expandClinicalQuery } from "@/lib/literature/query-expansion";
import { rerankSources } from "@/lib/literature/cohere-rerank";

function sourceDedupeKey(s: Source): string {
  return (s.doi ?? s.url).toLowerCase();
}

/** Prefer keeping OpenAlex metadata while attaching Europe PMC abstract / pmid when DOI matches */
function enrichSourceFromDuplicate(primary: Source, secondary: Source): Source {
  return {
    ...primary,
    abstractText: primary.abstractText ?? secondary.abstractText,
    pmid: primary.pmid ?? secondary.pmid,
  };
}

function mergeSources(openAlex: Source[], epmc: Source[]): Source[] {
  const order: string[] = [];
  const map = new Map<string, Source>();

  const add = (s: Source) => {
    const k = sourceDedupeKey(s);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, { ...s });
      order.push(k);
      return;
    }
    map.set(k, enrichSourceFromDuplicate(prev, s));
  };

  for (const s of openAlex) add(s);
  for (const s of epmc) add(s);

  return order.map((k, i) => ({ ...map.get(k)!, id: i + 1 }));
}

export async function fetchOpenAlexConcepts(query: string, limit = 8): Promise<Entity[]> {
  const q = query.trim();
  if (!q) return [];

  const url = new URL("https://api.openalex.org/autocomplete/concepts");
  url.searchParams.set("q", q);
  url.searchParams.set("per_page", String(limit));
  url.searchParams.set("mailto", "discovery-os@users.noreply.github.com");

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: { display_name?: string }[] };
  return (data.results ?? [])
    .map((r) => r.display_name)
    .filter(Boolean)
    .map((name) => ({ type: "Topic", name: name as string }));
}

export function deriveKeyFindings(sources: Source[]): KeyFinding[] {
  return sources.slice(0, 5).map((s) => ({
    text: `${s.title} — indexed as ${s.source} (${s.year}).`,
    cites: [s.id],
  }));
}

export type SummaryOpts = {
  treatmentExpanded?: boolean;
  therapeuticClinicalRetrieval?: boolean;
  strongRecencyQuery?: boolean;
  usedOpenAIExpansion?: boolean;
  usedOpenRouterExpansion?: boolean;
  usedCohereRerank?: boolean;
  usedOpenRouterRerank?: boolean;
  /** At least one abstract was fetched from Europe PMC for second-pass evidence rescoring */
  usedAbstractRescore?: boolean;
};

export function buildNarrativeSummary(
  query: string,
  sources: Source[],
  opts?: SummaryOpts,
): string {
  if (!query.trim()) {
    return "Enter a research question above. We will aggregate open literature from OpenAlex and Europe PMC.";
  }
  if (sources.length === 0) {
    return `No works were returned for “${query.trim()}”. Try broader keywords or check spelling.`;
  }
  const top = sources.slice(0, 3).map((s) => s.title);
  const expansionLabel = opts?.usedOpenRouterExpansion
    ? "OpenRouter LLM-expanded queries"
    : opts?.usedOpenAIExpansion
      ? "OpenAI LLM-expanded queries"
      : "rule-expanded queries";
  const rerankLabel = opts?.usedOpenRouterRerank
    ? "OpenRouter rerank + domain adjustments"
    : opts?.usedCohereRerank
      ? "Cohere rerank + domain adjustments"
      : "lexical reranking";
  const abstractNote = opts?.usedAbstractRescore
    ? " Top candidates were rescored using fetched abstracts (Europe PMC) for treatment-setting cues beyond the title."
    : "";
  let msg = `For “${query.trim()}”, we retrieved ${sources.length} records using ${expansionLabel}, structured Europe PMC retrieval, and ${rerankLabel}.${abstractNote} Representative titles: ${top.join("; ")}.`;
  if (opts?.treatmentExpanded) {
    msg += " Sub-queries emphasized therapeutic and trial-oriented literature.";
  }
  msg +=
    " Ordering reflects retrieval fit (semantic rerank when configured, plus anchors, therapy cues, regulatory/SOC boosts, and cross-tumor penalties)—not clinical endorsement or evidence strength.";
  if (opts?.strongRecencyQuery) {
    msg +=
      " Recency-focused wording in your query increases weight on newer publication years (with carve-outs for guideline/regulatory landmarks).";
  }
  return msg;
}

export async function searchLiterature(query: string): Promise<{
  sources: Source[];
  entities: Entity[];
  summaryOpts: SummaryOpts;
}> {
  const q = query.trim();
  if (!q) return { sources: [], entities: [], summaryOpts: {} };

  const expansion = await expandClinicalQuery(q);

  const oaPromises = expansion.subqueries.map((sq) =>
    fetchOpenAlexWorks(sq, 7).catch(() => [] as Source[]),
  );

  const [oaChunks, concepts, epmcTry] = await Promise.all([
    Promise.all(oaPromises).then((chunks) => chunks.flat()),
    fetchOpenAlexConcepts(q, 8).catch(() => [] as Entity[]),
    fetchEuropePmcResults(expansion.europePmcQuery, 24).catch(() => [] as Source[]),
  ]);

  let epmc = epmcTry;
  if (epmc.length === 0 && expansion.europePmcQuery !== q) {
    epmc = await fetchEuropePmcResults(q, 18).catch(() => [] as Source[]);
  }

  const merged = mergeSources(oaChunks, epmc);
  const { ranked, rerankProvider } = await rerankSources(expansion, q, merged);

  const abstractTopN = abstractRescoreTopNFromEnv();
  let finalRanked = ranked;
  let usedAbstractRescore = false;
  if (abstractTopN > 0 && expansion.therapeuticClinicalRetrieval) {
    const { sources: rescored } = await applyAbstractEvidenceRescore(
      expansion,
      ranked,
      abstractTopN,
    );
    finalRanked = rescored;
    usedAbstractRescore = rescored.some((s) => s.abstractUsedForRanking);
  }

  return {
    sources: finalRanked.slice(0, 28),
    entities: concepts,
    summaryOpts: {
      treatmentExpanded: expansion.treatmentIntent,
      therapeuticClinicalRetrieval: expansion.therapeuticClinicalRetrieval,
      strongRecencyQuery: expansion.strongRecencyQuery,
      usedOpenAIExpansion: expansion.expansionProvider === "openai",
      usedOpenRouterExpansion: expansion.expansionProvider === "openrouter",
      usedCohereRerank: rerankProvider === "cohere",
      usedOpenRouterRerank: rerankProvider === "openrouter",
      usedAbstractRescore,
    },
  };
}

export async function fetchAutocompleteWorkTitles(seed: string, limit = 6): Promise<string[]> {
  const q = seed.trim() || "cancer";
  const url = new URL("https://api.openalex.org/autocomplete/works");
  url.searchParams.set("q", q);
  url.searchParams.set("per_page", String(limit));
  url.searchParams.set("mailto", "discovery-os@users.noreply.github.com");

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: { display_name?: string }[] };
  return (data.results ?? []).map((r) => r.display_name).filter(Boolean) as string[];
}
