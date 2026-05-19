/**
 * Second-pass ranking: fetch abstracts for top-N hits and apply marginal therapeutic
 * evidence adjustments (title+abstract vs title-only). Falls back silently on failure.
 */

import type { Source } from "@/lib/research-types";
import type { ClinicalExpansion } from "@/lib/literature/query-expansion";
import {
  fetchEuropePmcAbstractByDoi,
  fetchEuropePmcAbstractByPmid,
} from "@/lib/literature/europepmc";
import {
  compareAdmissibilityComponents,
  computeAdmissibilitySortComponents,
  documentSurfaceForRanking,
  isEvidenceTierRankingEnabled,
} from "@/lib/literature/evidence-admissibility";
import {
  computeTherapeuticEvidenceAdjustments,
  sumAdjustments,
} from "@/lib/literature/therapy-evidence";

const ABSTRACT_SCORE_WINDOW = 4500;

function combineTitleAbstract(title: string, abstract: string): string {
  const a = abstract.slice(0, ABSTRACT_SCORE_WINDOW);
  return `${title}\n\n${a}`;
}

function extractPmidFromUrl(url: string): string | null {
  const m = url.match(/europepmc\.org\/article\/MED\/(\d+)/i);
  return m?.[1] ?? null;
}

function assignRelevanceBands(sources: Source[]): Source[] {
  const n = sources.length;
  return sources.map((s, i) => {
    let relevanceBand: Source["relevanceBand"];
    if (n <= 2) relevanceBand = i === 0 ? "top" : "related";
    else if (i < Math.ceil(n * 0.34)) relevanceBand = "top";
    else if (i < Math.ceil(n * 0.72)) relevanceBand = "related";
    else relevanceBand = "context";
    return { ...s, relevanceBand };
  });
}

async function ensureAbstract(s: Source): Promise<{ text: string | null; fetched: boolean }> {
  if (s.abstractText && s.abstractText.length > 60) {
    return { text: s.abstractText, fetched: false };
  }
  if (s.doi) {
    try {
      const t = await fetchEuropePmcAbstractByDoi(s.doi);
      if (t) return { text: t, fetched: true };
    } catch {
      /* ignore */
    }
  }
  const pmid = s.pmid ?? extractPmidFromUrl(s.url);
  if (pmid) {
    try {
      const t = await fetchEuropePmcAbstractByPmid(pmid);
      if (t) return { text: t, fetched: true };
    } catch {
      /* ignore */
    }
  }
  return { text: null, fetched: false };
}

const BATCH = 4;
const BATCH_DELAY_MS = 120;

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (x: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const part = await Promise.all(chunk.map(fn));
    out.push(...part);
    if (i + batchSize < items.length && BATCH_DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }
  return out;
}

/**
 * Re-rank the first `topN` sources using marginal therapeutic score from abstract text.
 * Remaining sources keep order and scores. No-op if not therapeutic clinical mode.
 */
export async function applyAbstractEvidenceRescore(
  expansion: ClinicalExpansion,
  sources: Source[],
  topN: number,
): Promise<{ sources: Source[]; abstractsFetched: number }> {
  if (!expansion.therapeuticClinicalRetrieval || topN <= 0 || sources.length === 0) {
    return { sources, abstractsFetched: 0 };
  }

  const n = Math.min(topN, sources.length);
  const head = sources.slice(0, n);
  const tail = sources.slice(n);

  let networkFetches = 0;
  const enriched = await mapInBatches(head, BATCH, async (s) => {
    const { text, fetched } = await ensureAbstract(s);
    if (fetched) networkFetches++;
    const abstractText = text ?? undefined;
    const titleOnlySum = sumAdjustments(computeTherapeuticEvidenceAdjustments(s.title, expansion));
    let delta = 0;
    if (abstractText && abstractText.length > 60) {
      const docSurface = combineTitleAbstract(s.title, abstractText);
      const fullSum = sumAdjustments(computeTherapeuticEvidenceAdjustments(docSurface, expansion));
      const w = abstractRescoreWeightFromEnv();
      delta = Math.round((fullSum - titleOnlySum) * w);
    }

    const baseScore = s.relevanceScore ?? 0;
    const relevanceAdjustments = [
      ...(s.relevanceAdjustments ?? []),
      ...(delta !== 0 ? [{ label: "abstractEvidenceDelta", delta }] : []),
    ];

    const next: Source = {
      ...s,
      abstractText,
      relevanceScore: baseScore + delta,
      relevanceAdjustments: relevanceAdjustments.length > 0 ? relevanceAdjustments : undefined,
      abstractUsedForRanking: Boolean(abstractText && abstractText.length > 60),
    };
    return next;
  });

  const useTier = isEvidenceTierRankingEnabled();
  const ranked = [...enriched].sort((a, b) => {
    if (!useTier) return (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
    const ca = computeAdmissibilitySortComponents(
      expansion,
      documentSurfaceForRanking(a.title, a.abstractText),
      a.relevanceScore ?? 0,
    );
    const cb = computeAdmissibilitySortComponents(
      expansion,
      documentSurfaceForRanking(b.title, b.abstractText),
      b.relevanceScore ?? 0,
    );
    return compareAdmissibilityComponents(ca, cb);
  });

  const mergedHead = useTier
    ? ranked.map((s) => {
        const adm = computeAdmissibilitySortComponents(
          expansion,
          documentSurfaceForRanking(s.title, s.abstractText),
          s.relevanceScore ?? 0,
        );
        return {
          ...s,
          clinicalEvidenceTier: adm.tierLabel,
          clinicalSettingViolation: adm.settingViolation,
          clinicalFrameMismatchRank: adm.frameMismatchRank,
          clinicalInterventionFrame: adm.interventionFrame,
        };
      })
    : ranked;

  const merged = [...mergedHead, ...tail];
  return { sources: assignRelevanceBands(merged), abstractsFetched: networkFetches };
}

export function abstractRescoreTopNFromEnv(): number {
  const raw = process.env.ABSTRACT_RESCORE_TOP_N?.trim();
  if (raw === "0" || raw === "") return 0;
  const n = parseInt(raw ?? "24", 10);
  if (Number.isNaN(n) || n < 0) return 24;
  return n;
}

/** Multiplier on marginal title→title+abstract therapeutic delta (calibration, not fetch logic). */
export function abstractRescoreWeightFromEnv(): number {
  const raw = process.env.ABSTRACT_RESCORE_WEIGHT?.trim();
  const def = 1.72;
  if (raw === undefined || raw === "") return def;
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n < 0) return def;
  return Math.min(Math.max(n, 0.35), 4);
}
