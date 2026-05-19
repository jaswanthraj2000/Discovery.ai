/**
 * Query therapeutic frames (QTF) × document intervention frames (DIF)
 * for intervention-aware admissibility governance.
 */

import type { ClinicalExpansion } from "@/lib/literature/query-expansion";
import { isPrimaryGuidelineAuthorityTitle } from "@/lib/literature/regulatory-recency";

export type QueryTherapeuticFrame =
  | "SOC_FRONTLINE_REGIMEN"
  | "FDA_APPROVAL"
  | "SYSTEMIC_METASTATIC"
  | "SURGICAL_RESECTABLE"
  | "NEOADJUVANT_PATHWAY"
  | "ADJUVANT_POSTOP"
  | "NONE";

export type DocumentInterventionFrame =
  | "CHEMOTHERAPY_REGIMEN"
  | "SURGERY"
  | "TARGET_DISCOVERY"
  | "ADJUNCTIVE_MEDICATION"
  | "IMMUNOTHERAPY_REVIEW"
  | "BIOMARKER"
  | "GUIDELINE_SYNTHESIS"
  | "RADIOTHERAPY"
  | "MIXED_MULTIMODAL"
  | "UNKNOWN_INTERVENTION";

const SOC_QUERY_RE =
  /\b(first[- ]line|second[- ]line|third[- ]line|frontline|standard\s+of\s+care|\bsoc\b|preferred\s+regimen|nccn\s+category|named\s+regimen)\b/i;

/** Active clinical intents on the query (multi-label). */
export function inferQueryTherapeuticFrames(expansion: ClinicalExpansion): QueryTherapeuticFrame[] {
  if (!expansion.therapeuticClinicalRetrieval) return ["NONE"];

  const q = expansion.normalizedQuery;
  const ctx = expansion.therapyQueryContext;
  const out: QueryTherapeuticFrame[] = [];

  if (ctx.explicitFdaLanguage || /\bfda[- ]approved|\bfda\s+approval\b/i.test(q)) {
    out.push("FDA_APPROVAL");
  }
  if (expansion.approvalSocIntent || SOC_QUERY_RE.test(q)) {
    out.push("SOC_FRONTLINE_REGIMEN");
  }
  if (ctx.wantsMetastatic) out.push("SYSTEMIC_METASTATIC");
  if (
    /\b(resectable|resection\b|surgery|whipple|pancreatectomy|operative\s+management)\b/i.test(q)
  ) {
    out.push("SURGICAL_RESECTABLE");
  }
  if (ctx.wantsNeoadjuvant || ctx.wantsLocallyAdvanced) out.push("NEOADJUVANT_PATHWAY");
  if (ctx.wantsAdjuvant || ctx.wantsResectedPostOp) out.push("ADJUVANT_POSTOP");

  const seen = new Set(out);
  return out.length > 0 ? Array.from(seen) : ["NONE"];
}

/** Primary frame for tie-breaking when multiple QTFs apply */
export function selectPrimaryQueryTherapeuticFrame(
  frames: QueryTherapeuticFrame[],
): QueryTherapeuticFrame {
  const s = new Set(frames);
  if (s.has("NONE") && frames.length === 1) return "NONE";

  if (s.has("SYSTEMIC_METASTATIC") && (s.has("SOC_FRONTLINE_REGIMEN") || s.has("FDA_APPROVAL"))) {
    return "SYSTEMIC_METASTATIC";
  }
  if (s.has("SYSTEMIC_METASTATIC")) return "SYSTEMIC_METASTATIC";
  if (s.has("NEOADJUVANT_PATHWAY")) return "NEOADJUVANT_PATHWAY";
  if (s.has("ADJUVANT_POSTOP")) return "ADJUVANT_POSTOP";
  if (s.has("FDA_APPROVAL")) return "FDA_APPROVAL";
  if (s.has("SOC_FRONTLINE_REGIMEN")) return "SOC_FRONTLINE_REGIMEN";
  if (s.has("SURGICAL_RESECTABLE")) return "SURGICAL_RESECTABLE";
  return "NONE";
}

function hasNeoOrLaContext(surface: string): boolean {
  return /\b(neoadjuvant|borderline|locally\s+advanced|perioperative|preoperative|conversion)\b/i.test(
    surface,
  );
}

function hasAdjuvantPostOpContext(surface: string): boolean {
  return /\badjuvant\b|postoperative|after\s+resection|resected\s+(?:patients?|tumor)/i.test(
    surface,
  );
}

/** Pairwise mismatch: 0 aligned, 1 marginal, 2 misaligned */
export function pairwiseFrameMismatch(
  q: QueryTherapeuticFrame,
  dif: DocumentInterventionFrame,
  surface: string,
): number {
  if (q === "NONE") return 0;
  if (dif === "GUIDELINE_SYNTHESIS") return 0;
  if (dif === "UNKNOWN_INTERVENTION") return 0;

  switch (q) {
    case "SYSTEMIC_METASTATIC":
      if (dif === "SURGERY" || dif === "RADIOTHERAPY") return 2;
      if (dif === "ADJUNCTIVE_MEDICATION") return 2;
      if (dif === "TARGET_DISCOVERY" || dif === "BIOMARKER") return 1;
      if (dif === "IMMUNOTHERAPY_REVIEW") return 1;
      return dif === "CHEMOTHERAPY_REGIMEN" || dif === "MIXED_MULTIMODAL" ? 0 : 1;

    case "SOC_FRONTLINE_REGIMEN":
      if (dif === "ADJUNCTIVE_MEDICATION") return 2;
      if (dif === "SURGERY" || dif === "RADIOTHERAPY") return 2;
      if (dif === "TARGET_DISCOVERY" || dif === "BIOMARKER") return 1;
      if (dif === "IMMUNOTHERAPY_REVIEW") return 1;
      return dif === "CHEMOTHERAPY_REGIMEN" || dif === "MIXED_MULTIMODAL" ? 0 : 1;

    case "FDA_APPROVAL":
      if (dif === "ADJUNCTIVE_MEDICATION") return 2;
      if (dif === "TARGET_DISCOVERY") return 1;
      if (dif === "IMMUNOTHERAPY_REVIEW") return 1;
      if (dif === "SURGERY" || dif === "RADIOTHERAPY") return 2;
      return dif === "CHEMOTHERAPY_REGIMEN" ? 0 : 1;

    case "NEOADJUVANT_PATHWAY":
      if (dif === "TARGET_DISCOVERY" || dif === "ADJUNCTIVE_MEDICATION") return 2;
      if (dif === "SURGERY" || dif === "MIXED_MULTIMODAL") {
        return hasNeoOrLaContext(surface) ? 0 : 1;
      }
      if (dif === "CHEMOTHERAPY_REGIMEN") {
        return hasNeoOrLaContext(surface) ? 0 : 1;
      }
      return 1;

    case "ADJUVANT_POSTOP":
      if (dif === "TARGET_DISCOVERY" || dif === "ADJUNCTIVE_MEDICATION") return 1;
      if (dif === "SURGERY") {
        return hasAdjuvantPostOpContext(surface) || hasNeoOrLaContext(surface) ? 0 : 2;
      }
      return dif === "CHEMOTHERAPY_REGIMEN" ? 0 : 1;

    case "SURGICAL_RESECTABLE":
      if (dif === "SURGERY" || dif === "MIXED_MULTIMODAL") return 0;
      if (dif === "CHEMOTHERAPY_REGIMEN") return hasNeoOrLaContext(surface) ? 0 : 1;
      return 1;

    default:
      return 0;
  }
}

/** Worst pairwise mismatch across all active query frames */
export function computeFrameMismatchRank(
  expansion: ClinicalExpansion,
  docSurface: string,
  dif: DocumentInterventionFrame,
): number {
  const frames = inferQueryTherapeuticFrames(expansion);
  let worst = 0;
  for (const q of frames) {
    worst = Math.max(worst, pairwiseFrameMismatch(q, dif, docSurface));
  }
  return worst;
}

/** Primary intervention object of the paper (title + abstract window). */
export function inferDocumentInterventionFrame(surface: string): DocumentInterventionFrame {
  const t = surface;

  if (isPrimaryGuidelineAuthorityTitle(t)) return "GUIDELINE_SYNTHESIS";

  const adjunctiveCue =
    /\b(renin-angiotensin|\braas\b|ace\s+inhibitor|angiotensin\s+(?:ii\s+)?receptor|\barb\b|concomitant\s+use|adjunctive\s+(?:therapy|medication)|beta[- ]blockers?)\b/i.test(
      t,
    );
  const regimenCue =
    /\b(folfirinox|gemcitabine|nab[- ]?paclitaxel|liposomal\s+irinotecan|onivyde|mfolfox|folfox|folfiri)\b/i.test(
      t,
    );
  const chemoTrialCue =
    /\bphase\s+(?:ii|iii|2|3)\b/i.test(t) &&
    /\b(chemotherapy|systemic|first[- ]line|metastatic|combination\s+therapy)\b/i.test(t) &&
    /\b(randomized|trial|patients?|multicenter)\b/i.test(t);

  if (adjunctiveCue && !regimenCue && !chemoTrialCue) return "ADJUNCTIVE_MEDICATION";

  if (
    /\bbiomarker\b/i.test(t) &&
    /\b(prognostic|predictive|selection|companion\s+diagnostic)\b/i.test(t) &&
    !chemoTrialCue
  )
    return "BIOMARKER";

  const surgeryPrimary =
    /\b(surgery\s+for|surgical\s+(?:resection|management|treatment)|pancreatectomy|whipple procedure|resectability\s+of)\b/i.test(
      t,
    ) && !/\bphase\s+(?:iii|ii)\b.*\b(randomized\s+chemotherapy|chemotherapy\s+alone)\b/i.test(t);

  if (
    surgeryPrimary &&
    !/\b(neoadjuvant\s+chemotherapy|perioperative\s+chemotherapy)\b/i.test(t) &&
    !regimenCue
  )
    return "SURGERY";

  if (regimenCue || chemoTrialCue) return "CHEMOTHERAPY_REGIMEN";

  if (/\b(meta-analysis|systematic\s+review)\b/i.test(t)) {
    if (adjunctiveCue && !regimenCue) return "ADJUNCTIVE_MEDICATION";
    if (/\b(chemotherapy|gemcitabine|folfirinox|systemic\s+therapy|cytotoxic)\b/i.test(t))
      return "CHEMOTHERAPY_REGIMEN";
    if (surgeryPrimary) return "SURGERY";
    return "UNKNOWN_INTERVENTION";
  }

  if (/\bimmunotherapy\b/i.test(t) && /\b(review|landscape|overview|perspective|future)\b/i.test(t))
    return "IMMUNOTHERAPY_REVIEW";

  if (/\b(sbrt|stereotactic\s+body|radiotherapy\s+for|chemoradiation)\b/i.test(t) && !chemoTrialCue)
    return "RADIOTHERAPY";

  if (
    /\b(neoadjuvant|perioperative)\b/i.test(t) &&
    /\b(chemotherapy|chemoradiation)\b/i.test(t) &&
    /\b(surgery|resection)\b/i.test(t)
  )
    return "MIXED_MULTIMODAL";

  if (
    /\bkras\b|\btumor\s+microenvironment\b|\bstromal\b|\btherapeutic\s+targeting\b|\bsignal(?:ing)?\s+pathway\b/i.test(
      t,
    ) &&
    !/\bphase\s+(?:ii|iii)\b/i.test(t)
  )
    return "TARGET_DISCOVERY";

  return "UNKNOWN_INTERVENTION";
}
