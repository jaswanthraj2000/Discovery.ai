import type { RankAdjustment, Source } from "@/lib/research-types";
import type { ClinicalExpansion } from "@/lib/literature/query-expansion";
import {
  type AdmissibilitySortComponents,
  compareAdmissibilityComponents,
  computeAdmissibilitySortComponents,
  documentSurfaceForRanking,
  isEvidenceTierRankingEnabled,
} from "@/lib/literature/evidence-admissibility";
import { rerankSourcesLexical } from "@/lib/literature/rerank";
import { OPENROUTER_RERANK_URL, buildOpenRouterHeaders } from "@/lib/literature/openrouter-client";
import { recencyRankingAdjustment } from "@/lib/literature/regulatory-recency";
import {
  computeTherapeuticEvidenceAdjustments,
  sumAdjustments,
} from "@/lib/literature/therapy-evidence";

const COHERE_RERANK_URL = "https://api.cohere.com/v1/rerank";

export type RerankBackend = "cohere" | "openrouter" | "lexical";

type CohereRerankResponse = {
  results?: { index: number; relevance_score?: number }[];
};

function docText(s: Source): string {
  const yearNote = s.pubYearSuspect ? " (metadata year clamped — verify)" : "";
  return `Title: ${s.title}\nVenue: ${s.venue}\nYear: ${s.year}${yearNote}\nType: ${s.type}\nAccess: ${s.access}`;
}

function buildRerankQuery(query: string, expansion: ClinicalExpansion): string {
  const anchors = expansion.anchors.slice(0, 10).join("; ");
  const competitors = expansion.competitorHints.slice(0, 12).join(", ");
  const intent = expansion.therapeuticClinicalRetrieval
    ? "CRITICAL: User wants APPROVED / STANDARD-OF-CARE oriented therapy evidence whenever applicable — prioritize FDA/EMA approvals, official NCCN/ESMO practice guideline documents (not letters or implementation surveys about guidelines), SOC regimens, first-line/second-line wording, and pivotal Phase II/III human trials with survival/outcomes. Massively deprioritize 'promising', speculative translational, fibroblast/TME/landscape-only concept papers without trial or regulatory framing. Strongly deprioritize biomarker-only, diagnostics/imaging-only, pathology-only, animal/in vitro models, case reports, and methods-only work unless clearly treatment-guiding."
    : expansion.treatmentIntent
      ? "Prioritize therapeutic interventions, clinical trials, guidelines, and targeted therapy."
      : "Prioritize mechanistic and disease-focused literature aligned with the question.";
  const recency = expansion.strongRecencyQuery
    ? "User emphasizes LATEST/RECENT/NEW evidence — heavily prioritize newer publication years unless the paper is clearly FDA-approved therapy or major guideline/NCCN/ESMO update language."
    : expansion.preferRecent
      ? "Prefer newer publications when equally relevant."
      : "";
  const pdacNet =
    expansion.pdacExocrineIntent && expansion.therapeuticClinicalRetrieval
      ? "Pancreatic question targets ductal/exocrine disease — strongly deprioritize titles dominated by neuroendocrine / pNET / islet cell / carcinoid unless clearly mixed histology with PDAC."
      : "";
  const approvalSoc =
    expansion.approvalSocIntent && expansion.therapeuticClinicalRetrieval
      ? "User seeks FDA-approved / standard-of-care regimens — prioritize titles naming established SOC combinations (e.g. FOLFIRINOX, gemcitabine with nab-paclitaxel, liposomal irinotecan in pancreatic context), FDA combination approvals, and Category 1 / preferred-regimen language; deprioritize Phase I, first-in-human, exploratory endpoints, preclinical work, and microenvironment ‘therapeutic targeting’ without human efficacy outcomes."
      : "";
  const c = expansion.therapyQueryContext;
  const adjResected =
    expansion.therapeuticClinicalRetrieval && (c.wantsAdjuvant || c.wantsResectedPostOp)
      ? "SETTING: ADJUVANT or RESECTED / postoperative disease — prioritize adjuvant chemotherapy trials, gemcitabine or FOLFIRINOX in adjuvant setting, DFS or recurrence outcomes, PRODIGE/ESPAC/CONKO-class trials, and guideline adjuvant recommendations for pancreatic cancer. Strongly deprioritize KRAS-targeting biology, tumor microenvironment / stromal mechanism papers, immunotherapy landscapes, epigenetics/BET benches, and metastatic first-line-only studies unless the title clearly concerns adjuvant or resected disease."
      : "";
  const therapySetting =
    expansion.therapeuticClinicalRetrieval &&
    (c.wantsMetastatic ||
      c.wantsAdjuvant ||
      c.wantsNeoadjuvant ||
      c.wantsLocallyAdvanced ||
      c.wantsMaintenance ||
      c.wantsSalvage)
      ? [
          c.wantsMetastatic
            ? "SETTING: metastatic / advanced systemic disease — do NOT rank adjuvant-only or neoadjuvant-only trials as top matches unless titles clearly include metastatic/advanced systemic management."
            : "",
          c.wantsAdjuvant ? "SETTING: adjuvant therapy — prefer adjuvant-context evidence." : "",
          c.wantsNeoadjuvant ? "SETTING: neoadjuvant / perioperative — prefer that context." : "",
          c.explicitFdaLanguage
            ? "User said FDA-approved — prioritize FDA label/approval/summary language and drugs@FDA-style regulatory references."
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      : "";
  return [
    `User question: ${query}`,
    `Primary disease anchors (exact / synonym match is critical): ${anchors || "(none)"}`,
    intent,
    competitors
      ? `Downrank titles dominated by unrelated cancer sites or topics: ${competitors}. Epidemiology-only or global burden papers unless clearly on-topic.`
      : "Downrank pure epidemiology or global burden studies if not directly answering the clinical question.",
    recency,
    pdacNet,
    approvalSoc,
    adjResected,
    therapySetting,
    expansion.therapeuticClinicalRetrieval
      ? "Boost FDA/EMA approval language, NCCN/ESMO guidelines, standard-of-care, randomized pivotal trials, and systematic reviews explicitly about therapy/outcomes."
      : "Boost systematic reviews and randomized or clinical interventional studies when relevant to the question.",
  ]
    .filter(Boolean)
    .join("\n");
}

function applyHybridAdjustments(
  baseScore: number,
  s: Source,
  expansion: ClinicalExpansion,
  query: string,
): { combined: number; relevanceAdjustments: RankAdjustment[] } {
  const title = (s.title ?? "").toLowerCase();
  const titleRaw = s.title ?? "";
  let adj = 0;

  const tc = expansion.therapeuticClinicalRetrieval;
  const review =
    /\b(systematic review|meta-analysis|scoping review|clinical review|practice guideline|nccn guideline)\b/i;
  if (review.test(title)) adj += tc ? 6 : 12;

  const clinical =
    /\b(randomized|randomised|phase\s+[i1-3]|clinical trial|multicenter|multicentre|double-blind|placebo.controlled)\b/i;
  if (clinical.test(title)) adj += tc ? 5 : 10;

  if (expansion.treatmentIntent) {
    if (
      /\b(treatment|therapy|chemotherapy|immunotherapy|targeted|inhibitor|regimen)\b/i.test(title)
    )
      adj += tc ? 2 : 6;
  }

  const therapeuticAdj = expansion.therapeuticClinicalRetrieval
    ? computeTherapeuticEvidenceAdjustments(titleRaw, expansion)
    : [];
  adj += sumAdjustments(therapeuticAdj);

  if (s.pubYearSuspect) adj -= 8;

  if (
    /\b(global burden|gbd\b|disease burden|years of life lost|registry methodology)\b/i.test(title)
  )
    adj -= 22;

  const recencyDelta = recencyRankingAdjustment(
    s.year,
    expansion.strongRecencyQuery,
    expansion.preferRecent,
    titleRaw,
    tc ? { dampenPreferRecentBonus: true } : undefined,
  );
  adj += recencyDelta;

  const relevanceAdjustments: RankAdjustment[] = [
    ...therapeuticAdj,
    ...(recencyDelta !== 0 ? [{ label: "publicationRecency", delta: recencyDelta }] : []),
  ];

  if (expansion.competitorHints.length > 0) {
    let comp = 0;
    let anch = 0;
    for (const c of expansion.competitorHints) {
      if (c.length >= 5 && title.includes(c.toLowerCase())) comp++;
    }
    for (const a of expansion.anchors) {
      if (a.length >= 3 && title.includes(a.toLowerCase())) anch++;
    }
    if (comp > 0 && anch === 0) adj -= 35;
    else if (comp > 0 && anch >= 1) adj -= 10;
  }

  const qWords = query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
  const titleWords = new Set(title.split(/\W+/));
  for (const w of qWords) {
    if (titleWords.has(w)) adj += 1.2;
  }

  return {
    combined: baseScore + adj,
    relevanceAdjustments,
  };
}

function assignBands(
  sorted: Array<{ s: Source; score: number; adm?: AdmissibilitySortComponents }>,
): Source[] {
  const n = sorted.length;
  return sorted.map(({ s, score, adm }, i) => {
    let relevanceBand: Source["relevanceBand"];
    if (n <= 2) relevanceBand = i === 0 ? "top" : "related";
    else if (i < Math.ceil(n * 0.34)) relevanceBand = "top";
    else if (i < Math.ceil(n * 0.72)) relevanceBand = "related";
    else relevanceBand = "context";
    return {
      ...s,
      relevanceScore: score,
      relevanceBand,
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

/**
 * Rerank with Cohere rerank-english-v3.0, then apply domain heuristics. Falls back to caller on failure.
 */
export async function rerankSourcesWithCohere(
  expansion: ClinicalExpansion,
  query: string,
  sources: Source[],
  apiKey: string,
  model: string,
): Promise<Source[] | null> {
  if (sources.length === 0) return [];

  const documents = sources.map(docText);
  const cohereQuery = buildRerankQuery(query, expansion);

  const res = await fetch(COHERE_RERANK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      query: cohereQuery,
      documents,
      top_n: documents.length,
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as CohereRerankResponse;
  const results = data.results;
  if (!results?.length || results.length !== documents.length) return null;

  const indexed = results
    .map((r) => ({
      idx: r.index,
      base: typeof r.relevance_score === "number" ? r.relevance_score : 0,
    }))
    .filter((r) => r.idx >= 0 && r.idx < sources.length);

  if (indexed.length === 0) return null;

  const useTier = isEvidenceTierRankingEnabled() && expansion.therapeuticClinicalRetrieval;

  const scored = indexed.map(({ idx, base }) => {
    const s = sources[idx]!;
    const { combined, relevanceAdjustments } = applyHybridAdjustments(
      base * 100,
      s,
      expansion,
      query,
    );
    const surface = documentSurfaceForRanking(s.title ?? "", s.abstractText);
    const adm = useTier
      ? computeAdmissibilitySortComponents(expansion, surface, combined)
      : undefined;
    return {
      s: {
        ...s,
        relevanceAdjustments: relevanceAdjustments.length > 0 ? relevanceAdjustments : undefined,
      },
      score: combined,
      adm,
    };
  });

  if (useTier) {
    scored.sort((a, b) => compareAdmissibilityComponents(a.adm!, b.adm!));
  } else {
    scored.sort((a, b) => b.score - a.score);
  }
  return assignBands(scored);
}

/**
 * OpenRouter /v1/rerank (e.g. cohere/rerank-v3.5), then same hybrid adjustments as Cohere path.
 */
export async function rerankSourcesWithOpenRouter(
  expansion: ClinicalExpansion,
  query: string,
  sources: Source[],
  apiKey: string,
  model: string,
): Promise<Source[] | null> {
  if (sources.length === 0) return [];

  const documents = sources.map(docText);
  const rerankQuery = buildRerankQuery(query, expansion);

  const res = await fetch(OPENROUTER_RERANK_URL, {
    method: "POST",
    headers: buildOpenRouterHeaders(apiKey),
    body: JSON.stringify({
      model,
      query: rerankQuery,
      documents,
      top_n: documents.length,
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as CohereRerankResponse;
  const results = data.results;
  if (!results?.length || results.length !== documents.length) return null;

  const indexed = results
    .map((r) => ({
      idx: r.index,
      base: typeof r.relevance_score === "number" ? r.relevance_score : 0,
    }))
    .filter((r) => r.idx >= 0 && r.idx < sources.length);

  if (indexed.length === 0) return null;

  const useTier = isEvidenceTierRankingEnabled() && expansion.therapeuticClinicalRetrieval;

  const scored = indexed.map(({ idx, base }) => {
    const s = sources[idx]!;
    const { combined, relevanceAdjustments } = applyHybridAdjustments(
      base * 100,
      s,
      expansion,
      query,
    );
    const surface = documentSurfaceForRanking(s.title ?? "", s.abstractText);
    const adm = useTier
      ? computeAdmissibilitySortComponents(expansion, surface, combined)
      : undefined;
    return {
      s: {
        ...s,
        relevanceAdjustments: relevanceAdjustments.length > 0 ? relevanceAdjustments : undefined,
      },
      score: combined,
      adm,
    };
  });

  if (useTier) {
    scored.sort((a, b) => compareAdmissibilityComponents(a.adm!, b.adm!));
  } else {
    scored.sort((a, b) => b.score - a.score);
  }
  return assignBands(scored);
}

/**
 * Direct Cohere first, then OpenRouter rerank, then lexical.
 */
export async function rerankSources(
  expansion: ClinicalExpansion,
  query: string,
  sources: Source[],
): Promise<{ ranked: Source[]; rerankProvider: RerankBackend }> {
  if (sources.length === 0) {
    return { ranked: [], rerankProvider: "lexical" };
  }

  const cohereKey = process.env.COHERE_API_KEY?.trim();
  const cohereModel = process.env.COHERE_RERANK_MODEL?.trim() || "rerank-english-v3.0";

  if (cohereKey) {
    try {
      const out = await rerankSourcesWithCohere(expansion, query, sources, cohereKey, cohereModel);
      if (out !== null) return { ranked: out, rerankProvider: "cohere" };
    } catch {
      /* fall through */
    }
  }

  const orKey = process.env.OPENROUTER_API_KEY?.trim();
  const orRerankModel = process.env.OPENROUTER_RERANK_MODEL?.trim() || "cohere/rerank-v3.5";

  if (orKey) {
    try {
      const out = await rerankSourcesWithOpenRouter(
        expansion,
        query,
        sources,
        orKey,
        orRerankModel,
      );
      if (out !== null) return { ranked: out, rerankProvider: "openrouter" };
    } catch {
      /* fall through */
    }
  }

  return { ranked: rerankSourcesLexical(expansion, query, sources), rerankProvider: "lexical" };
}
