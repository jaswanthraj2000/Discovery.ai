/**
 * Clinical admissibility ranking: lexicographic sort by
 * (evidence tier → query/document frame mismatch → setting violation → topical score).
 * Tiers: A (pivotal/guideline), B1 (clinical-secondary), B2 (conceptual/overview), C (weak/exploratory).
 */

import type { ClinicalExpansion } from "@/lib/literature/query-expansion";
import type { DocumentInterventionFrame } from "@/lib/literature/therapeutic-frames";
import {
  computeFrameMismatchRank,
  inferDocumentInterventionFrame,
} from "@/lib/literature/therapeutic-frames";
import {
  queryHasExplicitTreatmentSetting,
  type TherapyQueryContext,
} from "@/lib/literature/therapy-context";
import {
  docHasAdjuvantPostOpBridge,
  docHasNeoBorderlineBridge,
} from "@/lib/literature/treatment-setting-state";
import {
  LANDMARK_TRIAL_OR_OUTCOME_STRICT,
  isPrimaryGuidelineAuthorityTitle,
} from "@/lib/literature/regulatory-recency";

/** A best; B1 clinical-secondary; B2 conceptual/translational overview; C weakest */
export type ClinicalEvidenceTierLabel = "A" | "B1" | "B2" | "C";

/** Minimal authority labels inferred from title/abstract surface */
export type ClinicalAuthorityClass =
  | "GUIDELINE"
  | "PHASE3"
  | "REVIEW"
  | "CASE_REPORT"
  | "EXPLORATORY"
  | "UNKNOWN";

export type QuerySettingBucket = "ADJUVANT" | "METASTATIC" | "NEOADJUVANT";

export function isEvidenceTierRankingEnabled(): boolean {
  const v = process.env.ENABLE_EVIDENCE_TIER_RANKING?.trim().toLowerCase();
  if (v === "false" || v === "0") return false;
  return true;
}

export function documentSurfaceForRanking(title: string, abstractText?: string): string {
  const t = title.trim();
  if (abstractText && abstractText.length > 60) {
    return `${t}\n\n${abstractText.slice(0, 4500)}`;
  }
  return t;
}

function documentSettingFlags(text: string): {
  adjPost: boolean;
  metastatic: boolean;
  neoLa: boolean;
} {
  const t = text;
  const adjPost =
    /\badjuvant\b/i.test(t) ||
    /\b(postoperative|post-operative)\b/i.test(t) ||
    /\b(after\s+(?:surgical\s+)?resection|after\s+pancreatectomy|after\s+surgery)\b/i.test(t) ||
    /\bresected\s+(?:patients?|tumor|tumors|pdac|pancrea)/i.test(t);
  const metastatic =
    /\b(metastatic|metastasis|metastases|stage\s+iv|stage\s+4|distant\s+metastasis)\b/i.test(t) ||
    /\bm1\b(?!\d)/i.test(t);
  const neoLa = /\b(neoadjuvant|perioperative|borderline\s+resectable|locally\s+advanced)\b/i.test(
    t,
  );
  return { adjPost, metastatic, neoLa };
}

/** Query implies SOC / survival / explicit setting — conceptual overviews get tier-capped harder */
export function queryDemandsClinicalEvidenceSeparation(expansion: ClinicalExpansion): boolean {
  if (!expansion.therapeuticClinicalRetrieval) return false;
  const q = expansion.normalizedQuery;
  return (
    expansion.approvalSocIntent ||
    expansion.therapyQueryContext.explicitFdaLanguage ||
    queryHasExplicitTreatmentSetting(expansion.therapyQueryContext) ||
    /\b(survival|overall\s+survival|dfs|benefit|efficacy|hazard\s+ratio|\bos\b|\bpfs\b|standard\s+adjuvant|first[- ]line|frontline|regimen)\b/i.test(
      q,
    )
  );
}

/** Rescue from “conceptual overview” downgrade — real pivotal / synthesis evidence */
export function hasPivotalOrClinicalRescueCue(surface: string): boolean {
  const t = surface;
  if (isPrimaryGuidelineAuthorityTitle(t)) return true;
  if (/\b(systematic\s+review|meta-analysis)\b/i.test(t)) return true;
  if (
    /\bphase\s+(?:iii|3)\b/i.test(t) &&
    /\b(randomized|randomised|multicenter|multicentre|double-blind|overall\s+survival|progression[- ]free)\b/i.test(
      t,
    )
  )
    return true;
  if (LANDMARK_TRIAL_OR_OUTCOME_STRICT.test(t) && /\bphase\s+(?:ii|iii|2|3)\b/i.test(t))
    return true;
  return false;
}

/** Human interventional trial framing — do not treat as conceptual overview */
export function hasHumanInterventionalPhaseCue(surface: string): boolean {
  const t = surface;
  if (!/\bphase\s+(?:ii|iii|i{1,3}|1|2|3)\b/i.test(t)) return false;
  return /\b(randomized|randomised|trial|patients?|multicenter|multicentre|clinical\s+trial|cohort)\b/i.test(
    t,
  );
}

/**
 * Broad conceptual / mechanistic / “landscape” framing without pivotal rescue.
 * For SOC-style queries these must not sit in B1.
 */
export function isConceptualTranslationalOverview(surface: string): boolean {
  const t = surface;
  if (hasPivotalOrClinicalRescueCue(t)) return false;
  if (hasHumanInterventionalPhaseCue(t)) return false;

  if (
    /\b(therapeutic\s+landscape|landscape\s+of|future\s+directions|promising\s+avenue|emerging\s+landscape|pan[- ]cancer\s+landscape)\b/i.test(
      t,
    )
  )
    return true;
  if (
    /\b(importance\s+of|exploration\s+and\s+progress|progress\s+and\s+challenges)\b/i.test(t) &&
    /\b(landscape|precision\s+medicine|immunotherapy|targeted\s+therapy|oncology)\b/i.test(t)
  )
    return true;
  if (
    /\bprecision\s+medicine\b/i.test(t) &&
    /\b(overview|perspective|landscape|future|challenges)\b/i.test(t)
  )
    return true;
  if (
    /\b(molecular\s+pathology|signaling\s+pathway)\b/i.test(t) &&
    !/\bphase\s+(?:ii|iii|2|3)\b/i.test(t)
  )
    return true;
  if (
    /\btherapeutic\s+targeting\b/i.test(t) &&
    !/\bphase\s+(?:ii|iii|2|3)\b/i.test(t) &&
    !/\b(randomized|multicenter)\b/i.test(t)
  )
    return true;
  if (
    /\bkras\b/i.test(t) &&
    /\b(inhibit|inhibition|targeting|pathway|mutation)\b/i.test(t) &&
    !/\bphase\s+(?:ii|iii|2|3)\b/i.test(t)
  )
    return true;
  if (
    /\btumor\s+microenvironment\b|\bstromal\s+(?:targeting|cells?)|\bcancer-associated\s+fibroblast\b|\bcafs?\b/i.test(
      t,
    )
  )
    return true;
  if (/\bppar\s*[δd]|ppardelta|ppar-delta\b/i.test(t)) return true;
  if (
    /\bimmunotherapy\b/i.test(t) &&
    /\b(landscape|future\s+directions|overview|perspective|promising)\b/i.test(t)
  )
    return true;
  return false;
}

/** Explicit treatment-setting buckets implied by the query (minimal set). */
export function inferQuerySettingBuckets(ctx: TherapyQueryContext): QuerySettingBucket[] {
  const out: QuerySettingBucket[] = [];
  if (ctx.wantsAdjuvant || ctx.wantsResectedPostOp) out.push("ADJUVANT");
  if (ctx.wantsMetastatic) out.push("METASTATIC");
  if (ctx.wantsNeoadjuvant || ctx.wantsLocallyAdvanced) out.push("NEOADJUVANT");
  return out;
}

export function inferDocumentAuthorityClass(surface: string): ClinicalAuthorityClass {
  const t = surface;
  if (/\bcase\s+report\b|\bcase\s+series\b/i.test(t)) return "CASE_REPORT";
  if (isPrimaryGuidelineAuthorityTitle(t)) return "GUIDELINE";
  if (
    /\bphase\s+(?:iii|3)\b/i.test(t) &&
    /\b(randomized|randomised|multicenter|multicentre|double-blind|overall\s+survival|progression[- ]free)\b/i.test(
      t,
    )
  )
    return "PHASE3";
  if (LANDMARK_TRIAL_OR_OUTCOME_STRICT.test(t) && /\bphase\s+(?:iii|3)\b/i.test(t)) return "PHASE3";

  if (/\b(systematic\s+review|meta-analysis)\b/i.test(t)) return "REVIEW";

  if (
    /\b(preclinical|xenograft|murine\s+model|\bin\s+vitro\b|organoid)\b/i.test(t) &&
    !/\b(patients?|clinical\s+cohort|clinical\s+trial)\b/i.test(t)
  )
    return "EXPLORATORY";
  if (
    /\b(promising\s+avenue|future\s+directions|proof[- ]of[- ]concept|therapeutic\s+potential)\b/i.test(
      t,
    )
  )
    return "EXPLORATORY";
  if (
    /\bphase\s+i\b|\bphase\s+1\b|\bfirst[- ]in[- ]human|\bfih\b/i.test(t) &&
    !/\bphase\s+(?:ii|iii|2|3)\b/i.test(t)
  )
    return "EXPLORATORY";

  if (/\b(narrative\s+review|review\s+article)\b/i.test(t) && !/\bsystematic\s+review\b/i.test(t))
    return "REVIEW";

  return "UNKNOWN";
}

/**
 * Base tier from authority + coarse clinical cues (before conceptual cap & violation demotion).
 */
export function inferClinicalEvidenceTier(
  surface: string,
  authority: ClinicalAuthorityClass,
): ClinicalEvidenceTierLabel {
  if (authority === "GUIDELINE" || authority === "PHASE3") return "A";
  if (authority === "CASE_REPORT" || authority === "EXPLORATORY") return "C";
  if (authority === "REVIEW") {
    return /\b(systematic\s+review|meta-analysis)\b/i.test(surface) ? "A" : "B2";
  }
  if (/\bphase\s+(?:ii|2)\b/i.test(surface)) return "B1";
  return "B1";
}

/** Conceptual / landscape / mechanism overview → floor at B2 (never A/B1) unless rescued */
export function applyConceptualTierCap(
  tier: ClinicalEvidenceTierLabel,
  surface: string,
): ClinicalEvidenceTierLabel {
  if (tier === "C") return tier;
  if (!isConceptualTranslationalOverview(surface)) return tier;
  if (tier === "A" || tier === "B1") return "B2";
  return tier;
}

/**
 * For SOC-style queries, push borderline conceptual UNKNOWN titles from B1 → B2.
 * (When already matched as conceptual overview, applyConceptualTierCap handles it.)
 */
export function applyQueryStrictConceptualCap(
  tier: ClinicalEvidenceTierLabel,
  surface: string,
  expansion: ClinicalExpansion,
): ClinicalEvidenceTierLabel {
  if (!queryDemandsClinicalEvidenceSeparation(expansion)) return tier;
  if (tier !== "B1") return tier;
  if (hasPivotalOrClinicalRescueCue(surface) || hasHumanInterventionalPhaseCue(surface))
    return tier;
  if (isConceptualTranslationalOverview(surface)) return "B2";
  return tier;
}

/**
 * 0 = no violation / query has no explicit setting bucket
 * 1 = mild tension (e.g. LA-only vs adjuvant-only query)
 * 2 = severe mismatch (e.g. metastatic-only vs adjuvant query)
 */
export function computeSettingViolationRank(
  expansion: ClinicalExpansion,
  docSurface: string,
): number {
  const buckets = inferQuerySettingBuckets(expansion.therapyQueryContext);
  if (buckets.length === 0) return 0;

  const d = documentSettingFlags(docSurface);
  const ctx = expansion.therapyQueryContext;
  let worst = 0;

  for (const b of buckets) {
    if (b === "ADJUVANT") {
      if (d.metastatic && !d.adjPost && !docHasAdjuvantPostOpBridge(docSurface))
        worst = Math.max(worst, 2);
      else if (
        d.neoLa &&
        !d.adjPost &&
        !docHasAdjuvantPostOpBridge(docSurface) &&
        !ctx.wantsLocallyAdvanced &&
        !ctx.wantsNeoadjuvant
      )
        worst = Math.max(worst, 1);
    }
    if (b === "METASTATIC") {
      if (d.adjPost && !d.metastatic && !d.neoLa) worst = Math.max(worst, 2);
      else if (d.neoLa && !d.metastatic && !ctx.wantsNeoadjuvant && !ctx.wantsLocallyAdvanced)
        worst = Math.max(worst, 1);
    }
    if (b === "NEOADJUVANT") {
      if (d.metastatic && !d.neoLa && !d.adjPost) worst = Math.max(worst, 2);
      else if (d.adjPost && !d.neoLa && !docHasNeoBorderlineBridge(docSurface))
        worst = Math.max(worst, 2);
    }
  }

  return worst;
}

const TIER_ORDER: ClinicalEvidenceTierLabel[] = ["A", "B1", "B2", "C"];

/** One step down the ladder on severe setting mismatch */
export function demoteTierForViolation(
  tier: ClinicalEvidenceTierLabel,
  violation: number,
): ClinicalEvidenceTierLabel {
  if (violation < 2) return tier;
  const i = TIER_ORDER.indexOf(tier);
  if (i === -1) return tier;
  return TIER_ORDER[Math.min(i + 1, TIER_ORDER.length - 1)];
}

/** Tier-A papers whose intervention object mismatches the query (e.g. adjunctive meta-analysis) cap at B1 */
export function applyInterventionAwareTierCap(
  tier: ClinicalEvidenceTierLabel,
  expansion: ClinicalExpansion,
  docSurface: string,
  dif: DocumentInterventionFrame,
): ClinicalEvidenceTierLabel {
  if (!expansion.therapeuticClinicalRetrieval) return tier;
  const mm = computeFrameMismatchRank(expansion, docSurface, dif);
  if (mm < 2 || tier !== "A") return tier;
  if (
    dif === "ADJUNCTIVE_MEDICATION" ||
    dif === "SURGERY" ||
    dif === "RADIOTHERAPY" ||
    dif === "TARGET_DISCOVERY" ||
    dif === "BIOMARKER"
  )
    return "B1";
  return tier;
}

export function tierToRank(tier: ClinicalEvidenceTierLabel): number {
  const i = TIER_ORDER.indexOf(tier);
  return i === -1 ? TIER_ORDER.length - 1 : i;
}

export type AdmissibilitySortComponents = {
  tierRank: number;
  frameMismatchRank: number;
  settingViolation: number;
  topicalScore: number;
  tierLabel: ClinicalEvidenceTierLabel;
  interventionFrame: DocumentInterventionFrame;
};

export function computeAdmissibilitySortComponents(
  expansion: ClinicalExpansion,
  docSurface: string,
  topicalScore: number,
): AdmissibilitySortComponents {
  const dif = inferDocumentInterventionFrame(docSurface);
  const authority = inferDocumentAuthorityClass(docSurface);
  let tier = inferClinicalEvidenceTier(docSurface, authority);
  tier = applyConceptualTierCap(tier, docSurface);
  tier = applyQueryStrictConceptualCap(tier, docSurface, expansion);
  tier = applyInterventionAwareTierCap(tier, expansion, docSurface, dif);
  const violation = computeSettingViolationRank(expansion, docSurface);
  tier = demoteTierForViolation(tier, violation);
  const frameMismatchRank = computeFrameMismatchRank(expansion, docSurface, dif);
  return {
    tierRank: tierToRank(tier),
    frameMismatchRank,
    settingViolation: violation,
    topicalScore,
    tierLabel: tier,
    interventionFrame: dif,
  };
}

/** tier → frame mismatch → setting violation → topical */
export function compareAdmissibilityComponents(
  a: AdmissibilitySortComponents,
  b: AdmissibilitySortComponents,
): number {
  if (a.tierRank !== b.tierRank) return a.tierRank - b.tierRank;
  if (a.frameMismatchRank !== b.frameMismatchRank) return a.frameMismatchRank - b.frameMismatchRank;
  if (a.settingViolation !== b.settingViolation) return a.settingViolation - b.settingViolation;
  return b.topicalScore - a.topicalScore;
}
