import type { Source } from "@/lib/research-types";
import type { ClinicalExpansion } from "@/lib/literature/query-expansion";
import { recencyRankingAdjustment } from "@/lib/literature/regulatory-recency";
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

const NOISE_TITLE =
  /\b(global\s+burden|gbd\b|disease\s+burden\s+study|years\s+lost|disability.adjusted|national\s+registry\s+methodology|registry.based\s+cohort|cross.sectional\s+survey\s+of\s+incidence)\b/i;

const METHOD_ONLY =
  /\b(protocol\s+only|study\s+protocol|statistical\s+methods\s+for\s+meta.analysis|reporting\s+guidelines?\b)\b/i;

const THERAPY_BOOST =
  /\b(treatment|therapy|therapeutic|chemotherapy|immunotherapy|radiotherapy|targeted|inhibitor|regimen|clinical\s+trial|phase\s+[i1-3]|randomized|nccn|guideline|fda|approval|cart\b|car-t)\b/i;

const TRIAL_BOOST =
  /\b(trial|trials|clinical\s+trial|phase\s+[i1-3]|randomized|multicenter\s+study)\b/i;

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function countPhraseHits(text: string, phrases: string[]): number {
  let n = 0;
  const t = norm(text);
  for (const p of phrases) {
    const pn = norm(p);
    if (pn.length >= 3 && t.includes(pn)) n += 1;
  }
  return n;
}

function competitorHits(title: string, competitors: string[]): number {
  const t = norm(title);
  let n = 0;
  for (const c of competitors) {
    const cn = norm(c);
    if (cn.length >= 5 && t.includes(cn)) n += 1;
  }
  return n;
}

function anchorStrength(title: string, anchors: string[]): number {
  let score = 0;
  const t = norm(title);
  for (const a of anchors) {
    const an = norm(a);
    if (an.length < 2) continue;
    if (t.includes(an)) score += Math.min(18, 4 + an.length * 0.35);
    else if (an.split(/\s+/).every((w) => w.length > 2 && t.includes(w))) score += 10;
  }
  return score;
}

function tokenOverlap(query: string, title: string): number {
  const stop = new Set([
    "the",
    "for",
    "and",
    "with",
    "from",
    "into",
    "that",
    "this",
    "latest",
    "new",
    "recent",
  ]);
  const qt = norm(query)
    .split(/\W+/)
    .filter((w) => w.length > 3 && !stop.has(w));
  const tt = new Set(
    norm(title)
      .split(/\W+/)
      .filter((w) => w.length > 3),
  );
  let hits = 0;
  for (const w of qt) {
    if (tt.has(w)) hits++;
  }
  return hits * 3;
}

/**
 * Lexical + domain heuristic reranker (no external embedding API).
 * Downranks wrong-site tumors and epidemiology noise when anchors are specific.
 */
export function rerankSourcesLexical(
  expansion: ClinicalExpansion,
  query: string,
  sources: Source[],
): Source[] {
  const therapeuticMode = expansion.therapeuticClinicalRetrieval;
  const useAdm = isEvidenceTierRankingEnabled() && therapeuticMode;
  /** Pull generic lexical relevance toward “medium” so domain penalties/boosts reorder freely */
  const lexicalDamp = therapeuticMode ? 0.4 : 1;

  const scored = sources.map((s) => {
    const title = s.title ?? "";
    let score =
      (tokenOverlap(query, title) + anchorStrength(title, expansion.anchors)) * lexicalDamp;

    if (expansion.treatmentIntent) {
      const therapyBump = therapeuticMode ? 5 : 14;
      const trialBump = therapeuticMode ? 4 : 8;
      if (THERAPY_BOOST.test(title)) score += therapyBump;
      if (TRIAL_BOOST.test(title)) score += trialBump;
    }

    const therapeuticAdj = expansion.therapeuticClinicalRetrieval
      ? computeTherapeuticEvidenceAdjustments(title, expansion)
      : [];
    score += sumAdjustments(therapeuticAdj);

    if (s.pubYearSuspect) score -= 8;

    if (NOISE_TITLE.test(title)) score -= 28;
    if (METHOD_ONLY.test(title)) score -= 12;

    const recencyDelta = recencyRankingAdjustment(
      s.year,
      expansion.strongRecencyQuery,
      expansion.preferRecent,
      title,
      therapeuticMode ? { dampenPreferRecentBonus: true } : undefined,
    );
    score += recencyDelta;

    const comp = competitorHits(title, expansion.competitorHints);
    const anch = countPhraseHits(title, expansion.anchors);
    if (expansion.competitorHints.length > 0 && comp > 0) {
      if (anch === 0) score -= 55;
      else if (anch >= 2) score -= 8;
      else score -= 28;
    }

    const relevanceAdjustments = [
      ...therapeuticAdj,
      ...(recencyDelta !== 0 ? [{ label: "publicationRecency", delta: recencyDelta }] : []),
    ];

    const adm = useAdm
      ? computeAdmissibilitySortComponents(
          expansion,
          documentSurfaceForRanking(title, s.abstractText),
          score,
        )
      : undefined;

    return { s: { ...s }, score, relevanceAdjustments, adm };
  });

  scored.sort((a, b) => {
    if (useAdm && a.adm && b.adm) return compareAdmissibilityComponents(a.adm, b.adm);
    return b.score - a.score;
  });

  const n = scored.length;
  return scored.map(({ s, score, relevanceAdjustments, adm }, i) => {
    let relevanceBand: Source["relevanceBand"];
    if (n <= 2) relevanceBand = i === 0 ? "top" : "related";
    else if (i < Math.ceil(n * 0.34)) relevanceBand = "top";
    else if (i < Math.ceil(n * 0.72)) relevanceBand = "related";
    else relevanceBand = "context";

    return {
      ...s,
      relevanceScore: score,
      relevanceBand,
      relevanceAdjustments: relevanceAdjustments.length > 0 ? relevanceAdjustments : undefined,
      ...(adm
        ? {
            clinicalEvidenceTier: adm.tierLabel,
            clinicalSettingViolation: adm.settingViolation,
            clinicalFrameMismatchRank: adm.frameMismatchRank,
            clinicalInterventionFrame: adm.interventionFrame,
          }
        : {}),
    };
  });
}
