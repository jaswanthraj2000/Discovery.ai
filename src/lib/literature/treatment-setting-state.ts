/**
 * Treatment-setting states for query vs document (title + abstract surface).
 * Strong alignment + mismatch deltas so explicit adjuvant/neoadjuvant/LA intent beats generic PDAC therapy boosts.
 *
 * Structured ranking is ON by default; set ENABLE_SETTING_STATE=false to restore legacy therapySettingMismatch only.
 */

import type { RankAdjustment } from "@/lib/research-types";
import {
  queryHasExplicitTreatmentSetting,
  type TherapyQueryContext,
} from "@/lib/literature/therapy-context";

/** Narrow slice of ClinicalExpansion — avoids importing query-expansion (cycle with therapy-evidence). */
export type TreatmentSettingExpansionSlice = {
  therapeuticClinicalRetrieval: boolean;
  therapyQueryContext: TherapyQueryContext;
};

export const TREATMENT_SETTING_STATES = [
  "ADJUVANT",
  "NEOADJUVANT",
  "METASTATIC",
  "LOCALLY_ADVANCED",
  "RESECTABLE",
  "UNRESECTABLE",
  "POSTOPERATIVE",
  "MAINTENANCE",
  "SALVAGE",
] as const;

export type TreatmentSettingState = (typeof TREATMENT_SETTING_STATES)[number];

/** Default ON; set ENABLE_SETTING_STATE=false (or 0) for legacy mismatch-only behavior. */
export function isTreatmentSettingStateEnabled(): boolean {
  const v = process.env.ENABLE_SETTING_STATE?.trim().toLowerCase();
  if (v === "false" || v === "0") return false;
  return true;
}

function settingHardMismatchEnabled(): boolean {
  const v = process.env.SETTING_HARD_MISMATCH?.trim().toLowerCase();
  if (v === "false" || v === "0") return false;
  return true;
}

/** Lexical signals for document setting (apply to title + abstract combined). */
export function inferDocumentTreatmentSettingStates(text: string): Set<TreatmentSettingState> {
  const t = text;
  const s = new Set<TreatmentSettingState>();

  if (/\badjuvant\b/i.test(t)) s.add("ADJUVANT");
  if (/\bneoadjuvant\b/i.test(t)) s.add("NEOADJUVANT");
  if (/\bperioperative\b/i.test(t)) s.add("NEOADJUVANT");

  if (
    /\b(metastatic|metastasis|metastases|stage\s+iv|stage\s+4|distant\s+metastasis)\b/i.test(t) ||
    /\bm1\b(?!\d)/i.test(t)
  ) {
    s.add("METASTATIC");
  }

  if (/\blocally\s+advanced|borderline\s+resectable\b/i.test(t)) s.add("LOCALLY_ADVANCED");
  if (/\bunresectable\b/i.test(t)) s.add("UNRESECTABLE");
  if (/\bresectable\b/i.test(t) && !/\bunresectable\b/i.test(t)) s.add("RESECTABLE");

  if (
    /\b(postoperative|post-operative|after\s+(?:surgical\s+)?resection|after\s+pancreatectomy|after\s+surgery|curative\s+resection|radical\s+resection)\b/i.test(
      t,
    ) ||
    /\bresected\s+(?:patients?|tumor|tumors|pdac|pancrea)/i.test(t)
  ) {
    s.add("POSTOPERATIVE");
  }

  if (/\bmaintenance\b/i.test(t)) s.add("MAINTENANCE");
  if (/\bsalvage\b/i.test(t)) s.add("SALVAGE");

  return s;
}

export function inferQueryExpectedTreatmentStates(
  ctx: TherapyQueryContext,
): Set<TreatmentSettingState> {
  const s = new Set<TreatmentSettingState>();
  if (ctx.wantsAdjuvant) s.add("ADJUVANT");
  if (ctx.wantsNeoadjuvant) s.add("NEOADJUVANT");
  if (ctx.wantsMetastatic) s.add("METASTATIC");
  if (ctx.wantsLocallyAdvanced) s.add("LOCALLY_ADVANCED");
  if (ctx.wantsUnresectable) s.add("UNRESECTABLE");
  if (ctx.wantsResectable && !ctx.wantsUnresectable) s.add("RESECTABLE");
  if (ctx.wantsResectedPostOp) s.add("POSTOPERATIVE");
  if (ctx.wantsMaintenance) s.add("MAINTENANCE");
  if (ctx.wantsSalvage) s.add("SALVAGE");
  return s;
}

/** Broader cues than strict state tags — rescues trials/guidelines without the literal word “adjuvant”. */
export function docHasAdjuvantPostOpBridge(text: string): boolean {
  const t = text;
  if (/\badjuvant\b/i.test(t)) return true;
  if (/\b(postoperative|post-operative)\b/i.test(t)) return true;
  if (/\b(after\s+(?:surgical\s+)?resection|after\s+pancreatectomy|after\s+surgery)\b/i.test(t))
    return true;
  if (/\bresected\s+(?:patients?|tumor|tumors|pdac|pancrea)/i.test(t)) return true;
  if (/\b(prodig|espac|conko|norwegian\s+pancreat)\b/i.test(t)) return true;
  if (
    /\b(disease[- ]free\s+survival|\bdfs\b)\b/i.test(t) &&
    /\b(adjuvant|resect|postoperative|trial)\b/i.test(t)
  )
    return true;
  return false;
}

/** Surgery / local-regional therapeutic context for neoadjuvant & borderline queries. */
export function docHasNeoBorderlineBridge(text: string): boolean {
  const t = text;
  if (/\bneoadjuvant\b/i.test(t)) return true;
  if (/\bperioperative\b/i.test(t)) return true;
  if (/\bborderline\s+resectable\b/i.test(t)) return true;
  if (/\blocally\s+advanced\b/i.test(t)) return true;
  if (/\b(preoperative|induction\s+chemotherapy|conversion\s+therapy|downstaging)\b/i.test(t))
    return true;
  if (
    /\b(pancreatectomy|pancreatoduodenectomy|duodenectomy|whipple|surgical\s+resection)\b/i.test(t)
  )
    return true;
  if (/\bresectability\b/i.test(t)) return true;
  return false;
}

/** Bench / mechanism / vaccine papers that often steal relevance from curative-setting queries. */
export function docLooksTranslationalWrongLane(text: string): boolean {
  const t = text;
  if (
    /\b(neoantigen|personalized\s+vaccine|cancer\s+vaccine|therapeutic\s+vaccine|mrna\s+vaccine|peptide\s+vaccine)\b/i.test(
      t,
    )
  )
    return true;
  if (/\bkras\s*(?:g12c)?\s*inhibit|\btargeting\s+kras\b|\bkras\s+target/i.test(t)) return true;
  if (/\bepigenetic\s+(?:target|therapy|regulation|landscape)\b/i.test(t)) return true;
  if (/\b(biomarker\s+landscape|omic\s+landscape)\b/i.test(t)) return true;
  if (/\blandscape\s+of\s+(?:immunotherapy|radiotherapy|targeted\s+therapy)\b/i.test(t))
    return true;
  if (/\b(immunotherapy|radiotherapy)\s+landscape\b/i.test(t)) return true;
  if (/\b(preclinical|xenograft|murine\s+model|in\s+vitro)\b/i.test(t)) return true;
  if (/\bsignal(?:ing)?\s+pathway\b/i.test(t) && !/\bphase\s+(?:ii|iii|2|3)\b/i.test(t))
    return true;
  return false;
}

export function docLikelyHighValueAmbiguous(text: string): boolean {
  const t = text;
  if (/\b(nccn|esmo|asco)\b/i.test(t) && /\b(guideline|recommendation|consensus)\b/i.test(t))
    return true;
  if (/\b(systematic\s+review|meta-analysis)\b/i.test(t)) return true;
  if (
    /\bphase\s+(?:iii|ii|3|2)\b/i.test(t) &&
    /\b(randomized|randomised|multicentre|multicenter|rct)\b/i.test(t)
  )
    return true;
  return false;
}

function push(out: RankAdjustment[], label: string, delta: number): void {
  if (delta !== 0) out.push({ label, delta });
}

/**
 * Structured setting alignment / mismatch adjustments (replaces legacy mismatch when enabled).
 */
export function computeTreatmentSettingStateAdjustments(
  docSurface: string,
  expansion: TreatmentSettingExpansionSlice,
): RankAdjustment[] {
  if (!isTreatmentSettingStateEnabled() || !expansion.therapeuticClinicalRetrieval) return [];

  const ctx = expansion.therapyQueryContext;
  if (!queryHasExplicitTreatmentSetting(ctx)) return [];

  const expected = inferQueryExpectedTreatmentStates(ctx);
  const doc = inferDocumentTreatmentSettingStates(docSurface);
  const hard = settingHardMismatchEnabled();
  const out: RankAdjustment[] = [];
  const t = docSurface;

  let align = 0;
  for (const e of expected) {
    if (doc.has(e)) align += 34;
  }
  align = Math.min(align, 120);
  push(out, "settingStateAlign", align);

  if (!hard) return out;

  const docMeta = doc.has("METASTATIC");
  const docAdj = doc.has("ADJUVANT") || doc.has("NEOADJUVANT");
  const docPost = doc.has("POSTOPERATIVE");
  const docLA = doc.has("LOCALLY_ADVANCED");

  const wantsAdjOrPost =
    expected.has("ADJUVANT") || expected.has("POSTOPERATIVE") || expected.has("NEOADJUVANT");

  if (wantsAdjOrPost && docMeta && !docAdj && !docPost) {
    push(out, "settingMismatch_metastaticVsAdjuvantContext", -118);
  }

  if (expected.has("METASTATIC") && docAdj && !docMeta && !docLA) {
    push(out, "settingMismatch_adjuvantOnlyVsMetastaticQuery", -105);
  }

  if (expected.has("LOCALLY_ADVANCED") && docMeta && !docLA) {
    push(out, "settingMismatch_metastaticVsLAQuery", -72);
  }

  if (expected.has("NEOADJUVANT") && docMeta && !doc.has("NEOADJUVANT") && !docAdj) {
    push(out, "settingMismatch_metastaticVsNeoQuery", -112);
  }

  if (
    expected.has("MAINTENANCE") &&
    !doc.has("MAINTENANCE") &&
    (docAdj || doc.has("NEOADJUVANT"))
  ) {
    push(out, "settingMismatch_maintenanceVsEarlySettingDoc", -38);
  }

  if (expected.has("SALVAGE") && !doc.has("SALVAGE") && (docAdj || doc.has("NEOADJUVANT"))) {
    push(out, "settingMismatch_salvageVsCurativeDoc", -44);
  }

  const adjPostExpected = expected.has("ADJUVANT") || expected.has("POSTOPERATIVE");
  const neoLaExpected = expected.has("NEOADJUVANT") || expected.has("LOCALLY_ADVANCED");

  if (
    adjPostExpected &&
    !ctx.wantsLocallyAdvanced &&
    docLA &&
    !doc.has("ADJUVANT") &&
    !doc.has("POSTOPERATIVE") &&
    !docHasAdjuvantPostOpBridge(t)
  ) {
    push(out, "settingMismatch_laDominantVsAdjuvantPostOpQuery", -88);
  }

  const skipMissingAdjPenalty =
    docLikelyHighValueAmbiguous(t) ||
    docMeta ||
    docHasAdjuvantPostOpBridge(t) ||
    doc.has("ADJUVANT") ||
    doc.has("POSTOPERATIVE");

  if (adjPostExpected && !skipMissingAdjPenalty && docLooksTranslationalWrongLane(t)) {
    push(out, "settingMismatch_adjPostExpected_TranslationalWrongLane", -102);
  }

  const skipMissingNeoPenalty =
    docLikelyHighValueAmbiguous(t) || doc.has("NEOADJUVANT") || docHasNeoBorderlineBridge(t);

  if (
    neoLaExpected &&
    expected.has("NEOADJUVANT") &&
    !skipMissingNeoPenalty &&
    docLooksTranslationalWrongLane(t)
  ) {
    push(out, "settingMismatch_neoExpected_TranslationalWrongLane", -118);
  }

  return out;
}
