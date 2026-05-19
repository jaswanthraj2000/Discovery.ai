/**
 * Curated SOC / regimen ontology and evidence-state heuristics for therapeutic ranking.
 * Expand REGIMEN_CATALOG over time; this is a deliberate hybrid between KG-lite and regex.
 */

import type { ClinicalExpansion } from "@/lib/literature/query-expansion";
import type { RankAdjustment } from "@/lib/research-types";
import {
  inferTherapyQueryContext,
  queryHasExplicitTreatmentSetting,
  therapySettingMismatchPenalty,
  titleShowsAdjuvantResectedClinicalFit,
} from "@/lib/literature/therapy-context";
import {
  LANDMARK_TRIAL_OR_OUTCOME_STRICT,
  pdacVersusNetTitlePenalty,
  regulatorySocTitleAdjustment,
  speculativeTranslationalPenalty,
  translationalNoiseTitlePenalty,
  titleIsRegulatoryOrPrimaryGuidelineLandmark,
} from "@/lib/literature/regulatory-recency";
import {
  inferTherapeuticClinicalRetrieval,
  therapeuticClinicalTitleAdjustment,
} from "@/lib/literature/therapeutic-retrieval";
import {
  computeTreatmentSettingStateAdjustments,
  isTreatmentSettingStateEnabled,
} from "@/lib/literature/treatment-setting-state";

/** Query asks for approved / SOC / frontline / guideline-category framing — gates stronger experimental penalties and regimen boosts. */
const APPROVAL_SOC_QUERY_RE =
  /\b(fda[- ]approved|fda\s+approval|approved\s+(?:drug|therapy|therapies|regimen|regimens|combination)|standard\s+of\s+care|\bsoc\b|first[- ]line|second[- ]line|third[- ]line|frontline|nccn\s+category\s+1|category\s+1\s+recommendation|preferred\s+regimen|label(?:ed|led)?\s+(?:indication|expansion)|regulatory\s+approval|breakthrough\s+therapy\s+designation)\b/i;

const SURVIVAL_EVIDENCE_QUERY_RE =
  /\b(survival|overall\s+survival|dfs|disease[- ]free|benefit|efficacy|hazard\s+ratio|\bos\b|\bpfs\b|progression[- ]free|noninferiority|superiority|response\s+rate|standard\s+adjuvant|adjuvant\s+therapy\s+after)\b/i;

/** SOC / regulatory / survival-benefit style queries — strict evidence hierarchy */
export function wantsPivotalHumanEvidenceQuery(expansion: ClinicalExpansion): boolean {
  return (
    expansion.approvalSocIntent ||
    expansion.therapyQueryContext.explicitFdaLanguage ||
    SURVIVAL_EVIDENCE_QUERY_RE.test(expansion.normalizedQuery)
  );
}

export type ClinicalEvidenceTier = "strict" | "moderate" | "none";

/** Maps query + mode → how hard we enforce authority vs generic oncology wording */
export function clinicalEvidenceExpectationTier(
  expansion: ClinicalExpansion,
): ClinicalEvidenceTier {
  if (!expansion.therapeuticClinicalRetrieval) return "none";
  if (wantsPivotalHumanEvidenceQuery(expansion)) return "strict";
  if (queryHasExplicitTreatmentSetting(expansion.therapyQueryContext)) return "moderate";
  return "none";
}

export function amplifyTranslationalFramingPenalties(expansion: ClinicalExpansion): boolean {
  return clinicalEvidenceExpectationTier(expansion) !== "none";
}

export type RegimenCatalogEntry = {
  /** Stable id for tuning / telemetry */
  id: string;
  patterns: RegExp[];
  /** Require pancreatic site in title or PDAC expansion intent for full boost */
  pdacAnchored?: boolean;
};

/**
 * Known regimens / combinations commonly referenced as SOC (expand per tumor type).
 * Patterns are matched against titles for ranking boosts when retrieval is approval/SOC-oriented.
 */
export const REGIMEN_CATALOG: RegimenCatalogEntry[] = [
  { id: "folfirinox", patterns: [/\bfolfirinox\b/i], pdacAnchored: true },
  {
    id: "gemcitabine_nab_paclitaxel",
    patterns: [
      /\bgemcitabine\b\s*(?:\+|plus|and|;|,)?\s*nab(?:[- ]?)paclitaxel\b/i,
      /\bnab(?:[- ]?)paclitaxel\b\s*(?:\+|plus|and|;|,)?\s*\bgemcitabine\b/i,
      /\bgemcitabine\s+nabpaclitaxel\b/i,
    ],
    pdacAnchored: true,
  },
  {
    id: "liposomal_irinotecan",
    patterns: [/\bliposomal\s+irinotecan\b/i, /\bonivyde\b/i],
    pdacAnchored: true,
  },
  {
    id: "mfolfox",
    patterns: [/\bmfolfox(?:[- ]?\d+)?\b/i],
    pdacAnchored: true,
  },
  {
    id: "folfox_folfiri_generic",
    patterns: [/\bfolfox\b/i, /\bfolfiri\b/i],
    pdacAnchored: true,
  },
];

export function inferApprovalSocIntent(normalizedQuery: string, treatmentIntent: boolean): boolean {
  if (inferTherapyQueryContext(normalizedQuery).explicitFdaLanguage) return true;
  if (APPROVAL_SOC_QUERY_RE.test(normalizedQuery)) return true;
  const therapeutic = inferTherapeuticClinicalRetrieval(normalizedQuery, treatmentIntent);
  if (!treatmentIntent && !therapeutic) return false;
  return REGIMEN_CATALOG.some((e) => e.patterns.some((re) => re.test(normalizedQuery)));
}

/** Human pivotal-style cues — rescues from exploratory / TME penalties (title-only). */
export function titleHasStrongHumanOutcomeCue(title: string): boolean {
  return /\b(overall\s+survival|progression[- ]free|progression\s+free|objective\s+response|\borr\b|median\s+survival|phase\s+(?:ii|iii|2|3)|randomized|randomised|multicenter\s+(?:phase\s+)?(?:ii|iii|2|3))\b/i.test(
    title,
  );
}

function regimenMatchBoost(title: string, expansion: ClinicalExpansion): number {
  const wantHuge = expansion.approvalSocIntent;
  const wantModerate = expansion.therapeuticClinicalRetrieval && !wantHuge;
  if (!wantHuge && !wantModerate) return 0;

  const pancreaticTitle = /\b(pancreatic|pancreas|pdac|ductal\s+adenocarcinoma)\b/i.test(title);

  let best = 0;
  let fullPdacRegimenMatch = false;
  for (const entry of REGIMEN_CATALOG) {
    if (!entry.patterns.some((re) => re.test(title))) continue;
    const siteOk = !entry.pdacAnchored || pancreaticTitle || expansion.pdacExocrineIntent;
    if (!siteOk) {
      best = Math.max(best, wantHuge ? 14 : 8);
      continue;
    }
    fullPdacRegimenMatch = true;
    best = Math.max(best, wantHuge ? 54 : 30);
  }

  let out = Math.min(best, wantHuge ? 58 : 34);
  if (
    fullPdacRegimenMatch &&
    expansion.therapyQueryContext.wantsAdjuvant &&
    /\badjuvant\b/i.test(title)
  ) {
    out = Math.min(out + 18, wantHuge ? 66 : 44);
  }
  return out;
}

/** FDA / approval language for combination regimens (not duplicate of generic FDA approval boost). */
function fdaLabeledCombinationBoost(title: string, expansion: ClinicalExpansion): number {
  if (!expansion.approvalSocIntent) return 0;
  const t = title;
  if (!/\b(fda|approved)\b/i.test(t)) return 0;
  if (!/\b(combination|combined|dual|triplet|regimen)\b/i.test(t)) return 0;
  if (!/\b(therapy|therapeutic|treatment)\b/i.test(t)) return 0;
  return 20;
}

/** Extra downweight for “science-project” framing when the query is approval/SOC oriented. */
export function approvalSocTranslationalAmplifier(
  title: string,
  expansion: ClinicalExpansion,
): number {
  const demandRigor =
    expansion.approvalSocIntent || queryHasExplicitTreatmentSetting(expansion.therapyQueryContext);
  if (!demandRigor || titleIsRegulatoryOrPrimaryGuidelineLandmark(title)) return 0;
  if (titleHasStrongHumanOutcomeCue(title)) return 0;
  if (
    (expansion.therapyQueryContext.wantsAdjuvant ||
      expansion.therapyQueryContext.wantsResectedPostOp) &&
    titleShowsAdjuvantResectedClinicalFit(title)
  )
    return 0;

  let p = 0;
  if (/\blandscape\b/i.test(title)) p -= 26;
  if (/\bfuture\s+perspective|future\s+directions\b/i.test(title)) p -= 28;
  if (/\bpromising\b/i.test(title)) p -= 22;
  if (/\btargeting\b/i.test(title)) p -= 22;
  return p;
}

/** Investigational modalities — weak fit for SOC / explicit treatment-setting retrieval. */
export function investigationalModalityPenalty(
  title: string,
  expansion: ClinicalExpansion,
): number {
  const gate =
    expansion.approvalSocIntent || queryHasExplicitTreatmentSetting(expansion.therapyQueryContext);
  if (!gate || titleIsRegulatoryOrPrimaryGuidelineLandmark(title)) return 0;
  if (titleHasStrongHumanOutcomeCue(title)) return 0;
  if (titleShowsAdjuvantResectedClinicalFit(title)) return 0;

  const t = title;
  let p = 0;
  if (
    /\bbet\b.*\binhibit|\binhibit(?:or|ion)?\s+of\s+bet\b|bromodomain\s+(?:protein|inhibit)/i.test(
      t,
    )
  )
    p -= 32;
  if (/\bepigenetic(?:s)?(?:[- ]based)?\s+therapy\b|\bepigenetic\s+target/i.test(t)) p -= 28;
  if (/\bnano[- ]?onion\b|\bnanoparticle\b|\bnano(?:delivery|carrier|medicine)\b/i.test(t)) p -= 30;
  if (/\btranslational\s+advances?\b|\btranslational\s+research\b/i.test(t)) p -= 26;
  return p;
}

/** Upweight titles that match adjuvant / resected-disease clinical evidence when the query demands it */
export function adjuvantResectedClinicalBoost(title: string, expansion: ClinicalExpansion): number {
  const ctx = expansion.therapyQueryContext;
  if (!expansion.therapeuticClinicalRetrieval) return 0;
  if (!ctx.wantsAdjuvant && !ctx.wantsResectedPostOp) return 0;
  if (!titleShowsAdjuvantResectedClinicalFit(title)) return 0;

  let b = 28;
  if (
    ctx.wantsResectedPostOp &&
    /\b(resected|resection|postoperative|post-operative)\b/i.test(title)
  )
    b += 14;
  if (expansion.approvalSocIntent && /\b(fda|approved|guideline|nccn|category\s+1)\b/i.test(title))
    b += 12;
  return Math.min(b, 54);
}

/**
 * Heavy downrank for bench / metastatic IO noise when query is FDA-oriented adjuvant / resected PDAC.
 */
export function adjuvantApprovedQueryLeakPenalty(
  title: string,
  expansion: ClinicalExpansion,
): number {
  const ctx = expansion.therapyQueryContext;
  if (!expansion.therapeuticClinicalRetrieval) return 0;
  if (!ctx.wantsAdjuvant && !ctx.wantsResectedPostOp) return 0;
  if (!expansion.approvalSocIntent && !ctx.explicitFdaLanguage) return 0;
  if (titleShowsAdjuvantResectedClinicalFit(title)) return 0;
  if (titleIsRegulatoryOrPrimaryGuidelineLandmark(title)) return 0;

  const t = title;
  let p = 0;

  if (
    /\bkras\b/i.test(t) &&
    /\b(inhibit|inhibition|targeting|target|g12c|g12d|mutation|pathway)\b/i.test(t)
  )
    p -= 58;
  if (
    /\btumor\s+microenvironment\b|\bcancer-associated\s+fibroblast\b|\bstromal\s+(?:targeting|cell)\b/i.test(
      t,
    )
  )
    p -= 54;
  if (/\bimmunotherapy\s+landscape|\bimmune\s+(?:microenvironment\s+)?landscape\b/i.test(t))
    p -= 52;
  if (/\bbiomarker\s+discovery|\bprognostic\s+biomarker\b/i.test(t)) p -= 46;
  if (/\bepigenetic\b/i.test(t) && /\b(landscape|therapy|target)\b/i.test(t)) p -= 48;
  if (/\bbet\b/i.test(t) && /\binhibit/i.test(t)) p -= 42;
  if (
    /\bcheckpoint\s+inhibit/i.test(t) &&
    !/\badjuvant\b/i.test(t) &&
    !titleShowsAdjuvantResectedClinicalFit(t)
  )
    p -= 44;

  if (p === 0) {
    if (/\bsignal(?:ing)?\s+pathway\b|\bknockdown\b|\bcrispr\s+screen\b/i.test(t)) p -= 40;
    else if (
      /\btargeted\s+(?:agent|therapy)\b|\bprecision\s+medicine\b/i.test(t) &&
      !/\badjuvant|phase\s+(?:ii|iii)\b/i.test(t)
    )
      p -= 34;
  }

  return p;
}

/**
 * Downrank adj/post-op/neo-context leaks (KRAS/TME/IO landscapes) even when the query does not
 * mention FDA — curative-setting intent alone should not lose to generic mechanism hype.
 */
export function curativeSettingDirectedLeakPenalty(
  title: string,
  expansion: ClinicalExpansion,
): number {
  if (!expansion.therapeuticClinicalRetrieval) return 0;
  const ctx = expansion.therapyQueryContext;
  const adjPost = ctx.wantsAdjuvant || ctx.wantsResectedPostOp;
  const neo = ctx.wantsNeoadjuvant;
  if (!adjPost && !neo) return 0;

  const t = title;
  if (titleIsRegulatoryOrPrimaryGuidelineLandmark(t)) return 0;

  if (adjPost && (expansion.approvalSocIntent || ctx.explicitFdaLanguage)) return 0;
  if (adjPost && titleShowsAdjuvantResectedClinicalFit(t)) return 0;
  if (
    neo &&
    /\b(neoadjuvant|perioperative|borderline|locally\s+advanced|preoperative|resectability|conversion\s+therapy|downstaging)\b/i.test(
      t,
    )
  )
    return 0;

  let p = 0;
  if (
    /\bkras\b/i.test(t) &&
    /\b(inhibit|inhibition|targeting|target|g12c|g12d|mutation|pathway)\b/i.test(t)
  )
    p -= 64;
  if (
    /\btumor\s+microenvironment\b|\bcancer-associated\s+fibroblast\b|\bstromal\s+(?:targeting|cell)\b/i.test(
      t,
    )
  )
    p -= 60;
  if (/\bimmunotherapy\s+landscape|\bimmune\s+(?:microenvironment\s+)?landscape\b/i.test(t))
    p -= 56;
  if (/\bbiomarker\s+discovery|\bprognostic\s+biomarker\b/i.test(t)) p -= 48;
  if (/\bepigenetic\b/i.test(t) && /\b(landscape|therapy|target)\b/i.test(t)) p -= 52;
  if (
    /\bcheckpoint\s+inhibit/i.test(t) &&
    !/\badjuvant\b/i.test(t) &&
    !titleShowsAdjuvantResectedClinicalFit(t)
  )
    p -= 46;

  if (p === 0) {
    if (/\bsignal(?:ing)?\s+pathway\b|\bknockdown\b|\bcrispr\s+screen\b/i.test(t)) p -= 44;
    else if (
      /\btargeted\s+(?:agent|therapy)\b|\bprecision\s+medicine\b/i.test(t) &&
      !/\badjuvant|phase\s+(?:ii|iii)\b/i.test(t)
    )
      p -= 38;
  }

  return p;
}

/** Authority tier: case reports / exploratory reviews must not compete with pivotal human evidence */
export function clinicalEvidenceHierarchyPenalty(
  title: string,
  expansion: ClinicalExpansion,
): number {
  const tier = clinicalEvidenceExpectationTier(expansion);
  if (tier === "none") return 0;
  const t = title;
  if (titleIsRegulatoryOrPrimaryGuidelineLandmark(t)) return 0;
  if (titleHasStrongHumanOutcomeCue(t)) return 0;

  const strict = tier === "strict";
  let p = 0;
  if (/\bcase\s+report\b/i.test(t)) p -= strict ? 62 : 42;
  if (/\bcase\s+series\b/i.test(t)) p -= strict ? 46 : 32;
  if (/\bletter\s+to\s+the\s+editor\b/i.test(t)) p -= strict ? 32 : 16;
  if (/\bnarrative\s+review\b/i.test(t) && !/\bsystematic\b/i.test(t)) p -= strict ? 26 : 14;
  if (/\bproof[- ]of[- ]concept\b/i.test(t)) p -= strict ? 28 : 16;
  if (
    (/\bphase\s+i\b|\bphase\s+1\b/i.test(t) || /\bfirst[- ]in[- ]human|\bfih\b/i.test(t)) &&
    !LANDMARK_TRIAL_OR_OUTCOME_STRICT.test(t) &&
    !/\b(randomized|multicenter|multicentre)\b/i.test(t)
  ) {
    p -= strict ? 42 : 22;
  }
  return p;
}

/** User said “FDA-approved…” — boost titles that look like labels / regulatory summaries. */
export function fdaExplicitQueryTitleBoost(title: string, expansion: ClinicalExpansion): number {
  if (!expansion.therapyQueryContext.explicitFdaLanguage) return 0;
  const t = title;
  let d = 0;
  if (
    /\b(fda|food\s+and\s+drug\s+administration)\b/i.test(t) &&
    /\b(approv|label|indication)\b/i.test(t)
  )
    d += 28;
  if (/\b(full\s+)?prescribing\s+information\b|\bpackage\s+insert\b|usp\s+labeling\b/i.test(t))
    d += 24;
  if (/\bdrugs\s*@\s*fda\b|\blabel\s+update\b|\bproduct\s+label\b/i.test(t)) d += 22;
  if (/\b(category\s+1|nccn)\b/i.test(t) && /\b(guideline|recommendation)\b/i.test(t)) d += 14;
  return Math.min(d, 40);
}

/**
 * Early-phase / exploratory / bench cues — when query expects actionable / pivotal human evidence.
 */
export function experimentalTherapyPenalty(title: string, expansion: ClinicalExpansion): number {
  if (expansion.therapyQueryContext.explicitEarlyPhaseOk) return 0;
  const gate =
    expansion.approvalSocIntent ||
    wantsPivotalHumanEvidenceQuery(expansion) ||
    queryHasExplicitTreatmentSetting(expansion.therapyQueryContext);
  if (!gate) return 0;
  if (titleIsRegulatoryOrPrimaryGuidelineLandmark(title)) return 0;
  if (titleHasStrongHumanOutcomeCue(title)) return 0;

  let p = 0;
  if (/\bphase\s+i\b|\bphase\s+1\b/i.test(title)) p -= 58;
  if (/\bphase\s+i\s*\/\s*ii\b/i.test(title)) p -= 28;
  if (/\bfirst[- ]in[- ]human|\bfih\b|\bfirst[- ]in[- ]man\b/i.test(title)) p -= 56;
  if (/\bdose[- ]escalation\b|\b3\s*\+\s*3\b|\bdose[- ]finding\b/i.test(title)) p -= 36;
  if (/\bexploratory\b/i.test(title)) p -= 32;
  if (/\bpreclinical\b|\bxenograft\b|\bin\s+vitro\b|\borganoid\b/i.test(title)) p -= 40;
  if (/\bfuture\s+perspective|future\s+directions\b/i.test(title)) p -= 24;
  return p;
}

/**
 * Tumor microenvironment / myeloid / neutrophil therapeutic targeting without human outcome cues —
 * usually not clinically actionable for SOC-style questions.
 */
export function nonActionableImmuneTargetingPenalty(
  title: string,
  expansion: ClinicalExpansion,
): number {
  if (titleIsRegulatoryOrPrimaryGuidelineLandmark(title)) return 0;
  if (titleHasStrongHumanOutcomeCue(title)) return 0;

  const t = title;
  let p = 0;
  if (/\b(tumor[- ]associated\s+neutrophil|tumor[- ]infiltrating\s+neutrophil)\b/i.test(t)) p -= 34;
  if (/\b(myeloid[- ]derived\s+suppressor|\bmdsc\b)\b/i.test(t)) p -= 30;
  if (/\btherapeutic\s+targeting\b/i.test(t)) p -= 28;
  if (/\b(tumor[- ]associated\s+macrophage)\b/i.test(t) && /\btarget/i.test(t)) p -= 22;
  if (/\b(neutrophil\s+extracellular\s+trap|\bnetosis\b)\b/i.test(t)) p -= 26;
  if (amplifyTranslationalFramingPenalties(expansion)) {
    p = Math.round(p * 1.38);
  }
  return p;
}

function push(out: RankAdjustment[], label: string, delta: number): void {
  if (delta !== 0) out.push({ label, delta });
}

/**
 * Therapeutic-mode domain adjustments with per-label deltas for tuning and UI/debug.
 */
export function computeTherapeuticEvidenceAdjustments(
  title: string,
  expansion: ClinicalExpansion,
): RankAdjustment[] {
  const out: RankAdjustment[] = [];
  const amplifyFrame = amplifyTranslationalFramingPenalties(expansion);
  const tier = clinicalEvidenceExpectationTier(expansion);
  const settingScale = tier === "strict" ? 1.24 : tier === "moderate" ? 1.16 : 1;

  push(out, "therapeuticClinical", therapeuticClinicalTitleAdjustment(title));
  push(out, "regulatorySoc", regulatorySocTitleAdjustment(title));
  push(out, "clinicalEvidenceHierarchy", clinicalEvidenceHierarchyPenalty(title, expansion));
  push(out, "approvedRegimenOntology", regimenMatchBoost(title, expansion));
  push(out, "fdaCombinationLanguage", fdaLabeledCombinationBoost(title, expansion));
  push(out, "fdaExplicitQueryBoost", fdaExplicitQueryTitleBoost(title, expansion));
  push(
    out,
    "therapySettingMismatch",
    isTreatmentSettingStateEnabled()
      ? 0
      : therapySettingMismatchPenalty(
          title,
          expansion.therapyQueryContext,
          expansion.therapeuticClinicalRetrieval,
        ),
  );
  if (isTreatmentSettingStateEnabled()) {
    for (const a of computeTreatmentSettingStateAdjustments(title, expansion)) {
      push(out, a.label, Math.round(a.delta * settingScale));
    }
  }
  push(out, "adjuvantResectedAlign", adjuvantResectedClinicalBoost(title, expansion));
  push(out, "speculativeTranslational", speculativeTranslationalPenalty(title, amplifyFrame));
  push(out, "approvalSocAmplifier", approvalSocTranslationalAmplifier(title, expansion));
  push(out, "experimentalEarlyPhase", experimentalTherapyPenalty(title, expansion));
  push(out, "investigationalModality", investigationalModalityPenalty(title, expansion));
  push(out, "translationalNoise", translationalNoiseTitlePenalty(title, amplifyFrame));
  push(out, "immuneMicroenvTargeting", nonActionableImmuneTargetingPenalty(title, expansion));
  push(out, "adjuvantApprovedLeak", adjuvantApprovedQueryLeakPenalty(title, expansion));
  push(out, "settingDirectedLeak", curativeSettingDirectedLeakPenalty(title, expansion));
  push(out, "pdacVsNet", pdacVersusNetTitlePenalty(title, expansion.pdacExocrineIntent));

  return out;
}

export function sumAdjustments(adj: RankAdjustment[]): number {
  return adj.reduce((s, a) => s + a.delta, 0);
}
