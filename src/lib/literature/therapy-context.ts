/**
 * Treatment-setting cues from the query vs document titles (adjuvant vs metastatic, etc.).
 * Title-only until abstracts are available on Source.
 */

export type TherapyQueryContext = {
  wantsMetastatic: boolean;
  wantsAdjuvant: boolean;
  wantsNeoadjuvant: boolean;
  /** Curative-intent surgery context: resected disease, post-op chemotherapy trials */
  wantsResectedPostOp: boolean;
  wantsLocallyAdvanced: boolean;
  wantsMaintenance: boolean;
  wantsSalvage: boolean;
  wantsFirstLine: boolean;
  wantsSecondLine: boolean;
  wantsThirdLine: boolean;
  wantsResectable: boolean;
  wantsUnresectable: boolean;
  /** User explicitly asks for early-phase / Phase I–style investigation — relax buried-phase penalties */
  explicitEarlyPhaseOk: boolean;
  /** Query mentions FDA approval / labeling explicitly — boosts regulatory-primary titles */
  explicitFdaLanguage: boolean;
};

const DEFAULT_CONTEXT: TherapyQueryContext = {
  wantsMetastatic: false,
  wantsAdjuvant: false,
  wantsNeoadjuvant: false,
  wantsResectedPostOp: false,
  wantsLocallyAdvanced: false,
  wantsMaintenance: false,
  wantsSalvage: false,
  wantsFirstLine: false,
  wantsSecondLine: false,
  wantsThirdLine: false,
  wantsResectable: false,
  wantsUnresectable: false,
  explicitEarlyPhaseOk: false,
  explicitFdaLanguage: false,
};

export function inferTherapyQueryContext(normalizedQuery: string): TherapyQueryContext {
  const q = normalizedQuery;
  return {
    wantsMetastatic:
      /\b(metastatic|metastasis|metastases|stage\s+iv|stage\s+4|m1\b|distance\s+metastasis)\b/i.test(
        q,
      ) || /\badvanced\s+(?:unresectable\s+)?(?:pancreatic|pdac|pancreas\s+cancer)\b/i.test(q),
    wantsAdjuvant: /\badjuvant\b/i.test(q),
    wantsNeoadjuvant: /\bneoadjuvant\b/i.test(q),
    wantsResectedPostOp:
      /\bresected\b|\bresection\b|postoperative|post-operative|after\s+(?:surgical\s+)?resection|after\s+pancreatectomy|after\s+surgery|curative(?:[- ]intent)?\s+resection|radical\s+resection\b/i.test(
        q,
      ),
    wantsLocallyAdvanced: /\blocally\s+advanced|borderline\s+resectable\b/i.test(q),
    wantsMaintenance: /\bmaintenance\b/i.test(q),
    wantsSalvage: /\bsalvage\b/i.test(q),
    wantsFirstLine: /\bfirst[- ]line|first\s+line|frontline|\b1l\b/i.test(q),
    wantsSecondLine: /\bsecond[- ]line|\b2l\b/i.test(q),
    wantsThirdLine: /\bthird[- ]line|fourth[- ]line|\b3l\b|\b4l\b/i.test(q),
    wantsResectable: /\bresect(?:able|ed)\b|\bresection\b/i.test(q),
    wantsUnresectable: /\bunresectable\b/i.test(q),
    explicitEarlyPhaseOk:
      /\bphase\s+i\b|\bphase\s+1\b|\bearly[- ]phase|\binvestigational|first[- ]in[- ]human|\bfih\b/i.test(
        q,
      ),
    explicitFdaLanguage:
      /\bfda[- ]approved\b|\bfda\s+approval\b|\bfood\s+and\s+drug\s+administration\b|\bfda[- ]labeled\b|\bfda\s+label\b/i.test(
        q,
      ),
  };
}

/** Title-level treatment-setting mentions (coarse). */
function documentSettingSignals(title: string): {
  adjuvant: boolean;
  neoadjuvant: boolean;
  metastatic: boolean;
  locallyAdvanced: boolean;
  maintenance: boolean;
  salvage: boolean;
  perioperative: boolean;
} {
  const t = title;
  return {
    adjuvant: /\badjuvant\b/i.test(t),
    neoadjuvant: /\bneoadjuvant\b/i.test(t),
    metastatic:
      /\b(metastatic|metastasis|metastases|stage\s+iv|stage\s+4|advanced\s+disease)\b/i.test(t),
    locallyAdvanced: /\blocally\s+advanced\b/i.test(t),
    maintenance: /\bmaintenance\b/i.test(t),
    salvage: /\bsalvage\b/i.test(t),
    perioperative: /\bperioperative\b/i.test(t),
  };
}

export function queryHasExplicitTreatmentSetting(ctx: TherapyQueryContext): boolean {
  return (
    ctx.wantsMetastatic ||
    ctx.wantsAdjuvant ||
    ctx.wantsNeoadjuvant ||
    ctx.wantsResectedPostOp ||
    ctx.wantsLocallyAdvanced ||
    ctx.wantsMaintenance ||
    ctx.wantsSalvage ||
    ctx.wantsResectable ||
    ctx.wantsUnresectable
  );
}

/**
 * Title cues that match adjuvant / resected-disease clinical evidence (trials, guidelines, SOC words).
 */
export function titleShowsAdjuvantResectedClinicalFit(title: string): boolean {
  const t = title;
  if (/\badjuvant\b/i.test(t)) return true;
  if (
    /\b(postoperative|post-operative|after\s+resection|after\s+surgery|curative\s+resection|resected\s+(?:pancrea|tumor|patient))\b/i.test(
      t,
    )
  )
    return true;
  if (/\b(neoadjuvant|perioperative)\b/i.test(t) && /\b(resect|surgery)\b/i.test(t)) return true;
  if (/\b(prodig|espac|conko|norwegian\s+pancreat)\b/i.test(t)) return true;
  if (/\b(gemcitabine|capecitabine|fluorouracil|5[- ]fu)\b/i.test(t) && /\badjuvant\b/i.test(t))
    return true;
  if (/\bfolfirinox\b/i.test(t) && /\badjuvant\b/i.test(t)) return true;
  if (
    /\b(disease[- ]free\s+survival|\bdfs\b|recurrence[- ]free|relapse[- ]free)\b/i.test(t) &&
    /\b(adjuvant|resect|postoperative|trial)\b/i.test(t)
  )
    return true;
  if (
    /\b(nccn|esmo|asco)\b/i.test(t) &&
    /\b(guideline|recommendation|consensus)\b/i.test(t) &&
    /\b(adjuvant|resect)\b/i.test(t)
  )
    return true;
  if (/\b(systematic\s+review|meta-analysis)\b/i.test(t) && /\badjuvant\b/i.test(t)) return true;
  if (/\bphase\s+(?:ii|iii|2|3)\b/i.test(t) && /\badjuvant\b/i.test(t)) return true;
  return false;
}

/**
 * Downrank titles whose stated setting conflicts with an explicit query setting.
 */
export function therapySettingMismatchPenalty(
  title: string,
  ctx: TherapyQueryContext,
  therapeuticClinicalRetrieval: boolean,
): number {
  if (!therapeuticClinicalRetrieval || !queryHasExplicitTreatmentSetting(ctx)) return 0;

  const doc = documentSettingSignals(title);

  let p = 0;

  if (ctx.wantsMetastatic) {
    const compatibleMeta =
      doc.metastatic || /\b(unresectable|systemic|palliative\s+chemotherapy)\b/i.test(title);
    if (
      (doc.adjuvant || doc.neoadjuvant || doc.perioperative) &&
      !compatibleMeta &&
      !doc.locallyAdvanced
    )
      p -= 88;
    else if (doc.locallyAdvanced && !compatibleMeta && !doc.metastatic) p -= 38;
  }

  if (ctx.wantsAdjuvant && doc.metastatic && !doc.adjuvant && !doc.neoadjuvant) {
    p -= ctx.wantsResectedPostOp ? 96 : 78;
  }

  if (ctx.wantsNeoadjuvant && doc.metastatic && !doc.neoadjuvant && !doc.perioperative) p -= 72;

  if (ctx.wantsLocallyAdvanced && doc.metastatic && !doc.locallyAdvanced) p -= 52;

  if (ctx.wantsMaintenance && !doc.maintenance && (doc.adjuvant || doc.neoadjuvant)) p -= 34;

  if (ctx.wantsSalvage && !doc.salvage && (doc.adjuvant || doc.neoadjuvant)) p -= 42;

  return p;
}

export function emptyTherapyQueryContext(): TherapyQueryContext {
  return { ...DEFAULT_CONTEXT };
}
