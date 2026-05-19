/**
 * Regulatory / primary-guideline authority, recency, speculative translational,
 * and TME/noise penalties for therapeutic retrieval.
 */

/**
 * Pivotal-style cues for landmark rescue / recency — intentionally excludes bare “clinical trial”
 * so Phase I / first-in-human titles are not treated as regulatory-grade evidence.
 */
export const LANDMARK_TRIAL_OR_OUTCOME_STRICT =
  /\b(phase\s+iii|phase\s+ii|phase\s+3|phase\s+2|randomized|randomised|overall\s+survival|progression[- ]free|progression\s+free|double-blind|placebo.controlled)\b/i;

/** Letters, editorials, implementation science ABOUT guidelines — not the guideline itself. */
export function isGuidelineSecondaryOrMetaDiscourse(title: string): boolean {
  const t = title;
  if (
    /\b(letter\s+to\s+the\s+editor|authors['']?\s+reply|reply\s+to|correspondence|commentary|editorial|perspective)\b/i.test(
      t,
    )
  )
    return true;
  if (
    /\b(implementation|implementing|adherence|barriers|evaluating|evaluation\s+of|assessment\s+of|survey\s+of)\b/i.test(
      t,
    ) &&
    /\b(guideline|guidelines|nccn|esmo|recommendation)\b/i.test(t)
  )
    return true;
  if (
    /\b(guideline|guidelines|nccn|esmo)\b/i.test(t) &&
    /\b(letter|reply|commentary|editorial|implementation|adherence|survey|discussion\s+paper)\b/i.test(
      t,
    )
  )
    return true;
  return false;
}

/** Title suggests the work *is* or directly summarizes official guidance / approval (not meta-discourse). */
export function isPrimaryGuidelineAuthorityTitle(title: string): boolean {
  if (isGuidelineSecondaryOrMetaDiscourse(title)) return false;
  const t = title;
  if (/\b(clinical\s+practice\s+guideline|practice\s+guideline)\b/i.test(t)) return true;
  if (/\bguideline\s+(update|recommendation|statement)\b/i.test(t)) return true;
  if (
    /\b(consensus\s+recommendation|expert\s+consensus)\b/i.test(t) &&
    /\b(guideline|recommendation)\b/i.test(t)
  )
    return true;
  if (/\b(fda|ema|mhra)\b/i.test(t) && /\b(approv|authoriz|marketing\s+authorization)\b/i.test(t))
    return true;
  if (/\b(marketing\s+authorization)\b/i.test(t)) return true;
  if (/\b(indication\s+expansion|label\s+expansion)\b/i.test(t)) return true;
  if (
    /\b(standard\s+of\s+care|standard-of-care)\b/i.test(t) &&
    /\b(guideline|recommendation|update|statement)\b/i.test(t)
  )
    return true;
  if (
    /\b(nccn|esmo)\b/i.test(t) &&
    /\b(guideline|guidelines)\b/i.test(t) &&
    /\b(update|recommendation|clinical)\b/i.test(t)
  )
    return true;
  return false;
}

/**
 * Landmark signal for recency carve-outs and rescue from penalties — strict (primary authority / pivotal / FDA).
 */
export function titleIsRegulatoryOrPrimaryGuidelineLandmark(title: string): boolean {
  return (
    isPrimaryGuidelineAuthorityTitle(title) ||
    (/\b(fda|ema)\b/i.test(title) && /\b(approval|approved|authoriz)\b/i.test(title)) ||
    /\b(indication\s+expansion|label\s+expansion)\b/i.test(title) ||
    LANDMARK_TRIAL_OR_OUTCOME_STRICT.test(title)
  );
}

/** @deprecated loose signal — prefer titleIsRegulatoryOrPrimaryGuidelineLandmark for carve-outs */
export function titleHasRegulatoryOrGuidelineSignal(title: string): boolean {
  return titleIsRegulatoryOrPrimaryGuidelineLandmark(title);
}

/**
 * Regulatory / SOC boosts: large only for primary authority; bare NCCN/ESMO/guideline words get small boost;
 * guideline-adjacent commentary gets a penalty instead.
 */
export function regulatorySocTitleAdjustment(title: string): number {
  const t = title;

  if (
    isGuidelineSecondaryOrMetaDiscourse(t) &&
    /\b(nccn|esmo|guideline|recommendation)\b/i.test(t)
  ) {
    return -22;
  }

  let d = 0;

  if (/\b(fda|ema|mhra)\b/i.test(t)) {
    if (/\b(approval|approved|authorize|authoris|authorized)\b/i.test(t)) d += 32;
    else if (!isGuidelineSecondaryOrMetaDiscourse(t)) d += 14;
  }

  if (/\bmarketing\s+authorization\b/i.test(t)) d += 28;

  if (/\bapproved\b/i.test(t) && /\b(therapy|therapies|drug|agent|regimen|treatment)\b/i.test(t))
    d += 24;

  if (isPrimaryGuidelineAuthorityTitle(t)) {
    d += 30;
  } else {
    if (/\bnccn\b/i.test(t)) {
      if (/\b(guideline|update|recommendation)\b/i.test(t)) d += 6;
      else d += 4;
    }
    if (/\besmo\b/i.test(t) && /\b(guideline|recommendation|clinical|consensus)\b/i.test(t)) d += 6;
    else if (/\besmo\b/i.test(t)) d += 3;
    if (/\b(asco|nice)\b/i.test(t) && /\b(guideline|recommendation)\b/i.test(t)) d += 8;
  }

  if (
    /\b(standard\s+of\s+care|standard-of-care)\b/i.test(t) &&
    !isGuidelineSecondaryOrMetaDiscourse(t)
  )
    d += 18;

  if (/\b(category\s+1|class\s+i\s+recommendation)\b/i.test(t)) d += 16;
  if (/\bpreferred\s+regimen\b/i.test(t)) d += 14;

  if (
    /\b(frontline|first-line|first\s+line|second-line|second\s+line|third-line|salvage\s+therapy)\b/i.test(
      t,
    )
  )
    d += 12;

  return d;
}

/**
 * Downrank speculative / translational-framing when no regulatory or pivotal-trial cue (stricter than v1).
 */
export function speculativeTranslationalPenalty(
  title: string,
  amplifyFramingPenalties = false,
): number {
  const hasLandmark = titleIsRegulatoryOrPrimaryGuidelineLandmark(title);
  if (hasLandmark) return 0;

  let p = 0;
  if (
    /\b(promising|promising\s+avenue|potential\s+therapeutic|therapeutic\s+potential|may\s+represent)\b/i.test(
      title,
    )
  )
    p -= 26;
  if (
    /\b(neoantigen|mrna\s+vaccine|vaccine\s+.*\bpromising)\b/i.test(title) &&
    /\b(promising|potential|avenue)\b/i.test(title)
  )
    p -= 22;
  if (/\bproof.of.concept|proof\s+of\s+concept\b/i.test(title)) p -= 18;
  if (
    /\b(novel\s+target|emerging\s+target|therapeutic\s+avenue|emerging\s+landscape|novel\s+strategy)\b/i.test(
      title,
    )
  )
    p -= 20;
  if (/\b(rationale\s+for)\b/i.test(title) && /\b(target|therapy)\b/i.test(title)) p -= 14;
  if (/\b(translational\s+implications)\b/i.test(title)) p -= 16;
  if (/\b(mechanistic\s+immunotherapy|immunotherapy\s+.*\b(pathway|signaling|axis))\b/i.test(title))
    p -= 16;
  if (/\b(could\s+represent|may\s+offer|warrants\s+further)\b/i.test(title)) p -= 14;
  const scale = amplifyFramingPenalties ? 1.58 : 1;
  return Math.round(p * scale);
}

/**
 * TME / “landscape” translational noise — downrank for SOC-style retrieval unless rescued by trial/outcome/guideline.
 */
export function translationalNoiseTitlePenalty(
  title: string,
  amplifyFramingPenalties = false,
): number {
  if (titleIsRegulatoryOrPrimaryGuidelineLandmark(title)) return 0;

  let p = 0;
  const t = title;
  if (/\b(cancer-associated\s+fibroblast|\bcafs?\b|fibroblast|fibroblasts)\b/i.test(t)) p -= 18;
  if (/\b(tumor\s+microenvironment|tumou?r\s+stroma|stromal\s+cell|stromal)\b/i.test(t)) p -= 17;
  if (/\b(epigenetic\s+target|epigenetic\s+therapy|epigenome)\b/i.test(t)) p -= 14;
  if (/\b(landscape|pan-cancer|therapeutic\s+landscape)\b/i.test(t)) p -= 14;
  if (/\b(emerging\s+role|emerging\s+therapeutic)\b/i.test(t)) p -= 12;
  const scale = amplifyFramingPenalties ? 1.52 : 1;
  return Math.round(p * scale);
}

/**
 * Penalize pancreatic NET / islet / carcinoid-heavy titles when query targets PDAC/exocrine pancreas.
 */
export function pdacVersusNetTitlePenalty(title: string, pdacExocrineIntent: boolean): number {
  if (!pdacExocrineIntent) return 0;
  const t = title.toLowerCase();
  const netHeavy =
    /\b(neuroendocrine|pnet|pancreatic\s+nets?\b|islet\s+cell|well[- ]differentiated\s+nets?\b|carcinoid|gep-net|gastroenteropancreatic)\b/i.test(
      t,
    );
  const pdacCue =
    /\b(pdac|ductal\s+adenocarcinoma|pancreatic\s+ductal|pancreatic\s+adenocarcinoma|exocrine)\b/i.test(
      t,
    );
  if (netHeavy && !pdacCue) return -42;
  if (
    /\bsunitinib\b/i.test(t) &&
    /\b(pancreatic|pancreas)\b/i.test(t) &&
    /\b(neuroendocrine|pnet|pancreatic\s+nets?)\b/i.test(t)
  )
    return -44;
  return 0;
}

/**
 * Recency shaping: strong query wording gets steep preference for newer publications;
 * regulatory/guideline landmark papers get a carve-out from harsh age penalties.
 */
export function recencyRankingAdjustment(
  year: number,
  strongRecencyQuery: boolean,
  preferRecent: boolean,
  title: string,
  options?: { dampenPreferRecentBonus?: boolean },
): number {
  const calendarYear = new Date().getFullYear();
  const age = Math.max(0, calendarYear - year);
  const hasLandmark = titleIsRegulatoryOrPrimaryGuidelineLandmark(title);

  if (strongRecencyQuery) {
    let ageScore: number;
    if (age <= 2) ageScore = 32;
    else if (age <= 5) ageScore = 24;
    else if (age <= 8) ageScore = 14;
    else if (age <= 12) ageScore = 4;
    else if (age <= 18) ageScore = -8;
    else ageScore = -14 - Math.min(24, Math.floor((age - 18) * 1.1));

    if (hasLandmark && age > 10) {
      ageScore += Math.min(22, 12 + Math.floor((age - 10) * 0.45));
    } else if (LANDMARK_TRIAL_OR_OUTCOME_STRICT.test(title) && age > 15 && age <= 25) {
      ageScore += 10;
    }

    return ageScore;
  }

  let bonus = 0;
  if (preferRecent) {
    if (options?.dampenPreferRecentBonus) {
      if (year >= calendarYear - 4) bonus += 4;
      else if (year >= calendarYear - 8) bonus += 2;
    } else {
      if (year >= calendarYear - 4) bonus += 8;
      else if (year >= calendarYear - 8) bonus += 3;
    }
    if (age > 22 && !hasLandmark && !LANDMARK_TRIAL_OR_OUTCOME_STRICT.test(title)) bonus -= 6;
  }

  return bonus;
}
