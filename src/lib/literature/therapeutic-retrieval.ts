/**
 * Treatment-focused clinical retrieval: boosts human interventional evidence,
 * downranks bench/diagnostic/noise titles when the query asks for therapies/outcomes.
 */

const THERAPY_CUES =
  /\b(treatment|therapy|therapeutic|chemotherapy|immunotherapy|radiotherapy|targeted|inhibitor|regimen|drug|antibody|checkpoint|adjuvant|neoadjuvant|first-line|second-line)\b/i;

/** Query implies human therapeutic / outcomes retrieval (even without the word "treatment"). */
export function inferTherapeuticClinicalRetrieval(
  normalizedQuery: string,
  treatmentIntent: boolean,
): boolean {
  if (treatmentIntent) return true;
  return /\b(survival|efficacy|outcomes?\b|clinical\s+trial|phase\s+[123]|phase\s+ii|phase\s+iii|randomized|guideline|nccn|fda|approved)\b/i.test(
    normalizedQuery,
  );
}

/**
 * Score delta when therapeuticClinicalRetrieval mode is active (lexical + hybrid rerank).
 */
export function therapeuticClinicalTitleAdjustment(title: string): number {
  const t = title;
  let d = 0;

  if (/\b(randomized|randomised)\b/i.test(t) && /\b(trial|study)\b/i.test(t)) d += 11;
  else if (/\bclinical\s+trial\b/i.test(t)) d += 9;
  else if (
    /\bphase\s+(?:i{1,3}|[123])\b/i.test(t) ||
    /\bphase\s+ii\b/i.test(t) ||
    /\bphase\s+iii\b/i.test(t)
  )
    d += 9;

  if (/\b(systematic\s+review|meta-analysis)\b/i.test(t) && THERAPY_CUES.test(t)) d += 11;
  else if (/\b(systematic\s+review|meta-analysis)\b/i.test(t)) d += 4;

  if (/\b(consensus\s+statement|expert\s+panel|clinical\s+consensus)\b/i.test(t)) d += 6;

  if (
    /\b(overall\s+survival|progression-free|progression\s+free|median\s+survival|objective\s+response|\borr\b|\bdfs\b)\b/i.test(
      t,
    )
  )
    d += 11;
  /* Generic “therapy” wording — keep low so setting + authority dominate */
  if (THERAPY_CUES.test(t)) d += 2;

  const humanCue = /\b(patients?|human|cohort|clinical\s+cohort|population)\b/i.test(t);

  if (
    /\b(mouse|murine|xenograft|\brats?\b|zebrafish|\bin\s+vitro\b|cell\s+line)\b/i.test(t) &&
    !humanCue
  )
    d -= 24;

  if (/\bcase\s+report\b/i.test(t) || /\bcase\s+series\b/i.test(t)) d -= 26;

  if (
    /\b(biomarker\s+discovery|diagnostic\s+accuracy|prognostic\s+biomarker|liquid\s+biopsy\s+for\s+detection)\b/i.test(
      t,
    ) &&
    !THERAPY_CUES.test(t)
  )
    d -= 14;

  if (/\b(radiomics|imaging\s+biomarker|pet-ct|pet\/ct)\b/i.test(t) && !THERAPY_CUES.test(t))
    d -= 10;

  if (/\b(metabolomics|metabolic\s+profiling)\b/i.test(t) && !THERAPY_CUES.test(t)) d -= 9;

  if (
    /\b(signaling\s+pathway|knockdown|sirna|crispr\s+screen)\b/i.test(t) &&
    !/\b(patient|clinical|trial)\b/i.test(t)
  )
    d -= 10;

  if (/\b(pathogenesis|pathophysiology)\b/i.test(t) && !THERAPY_CUES.test(t)) d -= 7;

  if (/\b(method\s+development|statistical\s+methods)\b/i.test(t)) d -= 8;

  return d;
}
