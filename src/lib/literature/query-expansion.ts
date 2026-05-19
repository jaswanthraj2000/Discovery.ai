/**
 * Clinical query expansion: adds domain phrases and parallel sub-queries before
 * hitting OpenAlex / Europe PMC literal search endpoints.
 */

import {
  fetchOpenAiClinicalExpansion,
  type LlmExpansionPayload,
} from "@/lib/literature/openai-expansion";
import { fetchOpenRouterClinicalExpansion } from "@/lib/literature/openrouter-expansion";
import {
  type TherapyQueryContext,
  inferTherapyQueryContext,
} from "@/lib/literature/therapy-context";
import { inferApprovalSocIntent } from "@/lib/literature/therapy-evidence";
import { inferTherapeuticClinicalRetrieval } from "@/lib/literature/therapeutic-retrieval";

export type ClinicalExpansion = {
  normalizedQuery: string;
  /** Distinct OpenAlex/Europe PMC search strings (includes normalized original). */
  subqueries: string[];
  /** Phrases used to score title/venue alignment (must appear for high precision). */
  anchors: string[];
  /** Title tokens that suggest a *different* primary cancer site → penalize when anchors are site-specific. */
  competitorHints: string[];
  /** User wants therapeutic / interventional literature. */
  treatmentIntent: boolean;
  /**
   * Stronger mode: prioritize human trials, outcomes, guidelines; downrank bench/diagnostic-heavy titles.
   */
  therapeuticClinicalRetrieval: boolean;
  /**
   * Pancreatic exocrine / PDAC-style intent — penalize neuroendocrine / NET-heavy titles in rerank.
   */
  pdacExocrineIntent: boolean;
  /**
   * User asks for FDA-approved / SOC / frontline / Category 1–style care — boosts named regimens; penalizes early-phase bench framing.
   */
  approvalSocIntent: boolean;
  /** Parsed treatment-setting intent (metastatic vs adjuvant, line of therapy, explicit FDA wording). */
  therapyQueryContext: TherapyQueryContext;
  /** Query asks for recent work (boost newer years lightly in rerank). */
  preferRecent: boolean;
  /**
   * Explicit “latest/recent/new/…” intent → stronger publication-year shaping so old landmarks don’t dominate.
   */
  strongRecencyQuery: boolean;
  /** Single structured Europe PMC query string. */
  europePmcQuery: string;
  /** Set after expansion: lexical vs direct OpenAI vs OpenRouter chat. */
  expansionProvider?: "lexical" | "openai" | "openrouter";
};

const TREATMENT_RE =
  /\b(treatment|therapy|therapies|therapeutic|intervention|management|drug|drugs|chemotherapy|immunotherapy|radiotherapy|targeted|inhibitor|inhibitors|trial|trials|clinical\s+trial|regimen|standard\s+of\s+care|guideline|nccn|fda|approval)\b/i;

const RECENCY_RE = /\b(latest|recent|new|emerging|current|updated|202[3-9]|202\d)\b/i;

/** Words that imply user cares strongly about publication recency (not only calendar-year literals). */
const STRONG_RECENCY_RE =
  /\b(latest|recent|new|emerging|updated|current\s+(?:data|evidence|options)|past\s+(?:two|three|\d+)\s+years)\b/i;

/** Cancer sites with synonyms and “wrong cancer” distractors for reranking. */
const SITE_PROFILES: {
  match: RegExp;
  anchors: string[];
  extraSubqueries: string[];
  competitors: string[];
}[] = [
  {
    match:
      /\b(pancreat(ic|eas)|p\.?\s*d\.?\s*a\.?\s*c\.?\b|ductal\s+adenocarcinoma\s+of\s+the\s+pancreas)\b/i,
    anchors: [
      "pancreatic",
      "pancreas",
      "pdac",
      "pancreatic ductal adenocarcinoma",
      "pancreatic cancer",
      "pancreatic neoplasm",
      "pancreatic tumor",
      "pancreatic carcinoma",
    ],
    extraSubqueries: [
      "pancreatic ductal adenocarcinoma therapy",
      "PDAC targeted therapy",
      "pancreatic cancer immunotherapy trial",
      "pancreatic cancer chemotherapy",
      "KRAS pancreatic cancer inhibitor",
      "pancreatic adenocarcinoma clinical trial",
      "FOLFIRINOX pancreatic cancer",
    ],
    competitors: [
      "colorectal",
      "colon cancer",
      "rectal cancer",
      "breast cancer",
      "lung cancer",
      "hepatocellular",
      "liver cancer",
      "gastric cancer",
      "stomach cancer",
      "ovarian cancer",
      "prostate cancer",
      "melanoma",
      "glioma",
      "renal cell",
      "kidney cancer",
      "bladder cancer",
      "thyroid cancer",
      "esophageal",
      "head and neck squamous",
      "multiple myeloma",
      "lymphoma",
      "leukemia",
    ],
  },
  {
    match: /\b(colorectal|colon\s+cancer|rectal\s+cancer|crc\b)\b/i,
    anchors: ["colorectal", "colon cancer", "rectal cancer", "colon carcinoma"],
    extraSubqueries: [
      "colorectal cancer therapy",
      "colon cancer targeted therapy",
      "colorectal cancer immunotherapy trial",
    ],
    competitors: [
      "pancreatic cancer",
      "breast cancer",
      "lung cancer",
      "gastric cancer",
      "hepatocellular",
      "melanoma",
    ],
  },
  {
    match: /\b(lung\s+cancer|nsclc|sclc|pulmonary\s+neoplasm)\b/i,
    anchors: ["lung cancer", "nsclc", "pulmonary", "lung neoplasm", "lung carcinoma"],
    extraSubqueries: [
      "lung cancer targeted therapy",
      "NSCLC immunotherapy trial",
      "lung cancer chemotherapy",
    ],
    competitors: ["pancreatic cancer", "breast cancer", "colorectal", "melanoma"],
  },
  {
    match: /\b(breast\s+cancer|mammary\s+carcinoma|her2)\b/i,
    anchors: ["breast cancer", "breast carcinoma", "mammary"],
    extraSubqueries: ["breast cancer targeted therapy", "breast cancer immunotherapy trial"],
    competitors: ["pancreatic cancer", "lung cancer", "colorectal"],
  },
];

/** When the query is adjuvant / resected PDAC, steer retrieval away from generic KRAS–IO–stroma pulls */
const PDAC_ADJUVANT_RESECTED_SUBQUERIES: string[] = [
  "adjuvant chemotherapy resected pancreatic ductal adenocarcinoma",
  "gemcitabine adjuvant pancreatic cancer randomized trial",
  "adjuvant FOLFIRINOX pancreatic cancer PRODIGE",
  "ESPAC adjuvant pancreatic cancer gemcitabine",
  "resected pancreatic cancer adjuvant therapy guideline",
  "disease-free survival adjuvant PDAC phase III",
  "CONKO adjuvant pancreatic cancer",
  "NCCN adjuvant pancreatic ductal adenocarcinoma",
];

function uniqueStrings(xs: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const k = x.trim().replace(/\s+/g, " ");
    if (k.length < 3 || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
    if (out.length >= max) break;
  }
  return out;
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildEpmcQuery(
  anchors: string[],
  treatmentIntent: boolean,
  therapeuticClinicalRetrieval: boolean,
): string {
  const phrases = anchors.slice(0, 5);
  const core =
    phrases.length > 0
      ? `(${phrases.map((a) => `(TITLE:"${esc(a)}" OR ABSTRACT:"${esc(a)}")`).join(" OR ")})`
      : "";

  const wantTherapyClause = treatmentIntent || therapeuticClinicalRetrieval;
  const tx = wantTherapyClause
    ? `(treatment OR therapy OR therapeutic OR chemotherapy OR immunotherapy OR "clinical trial" OR targeted OR inhibitor OR regimen OR intervention OR survival OR efficacy OR outcome OR guideline OR approval OR randomized)`
    : "";

  if (core && tx) return `${core} AND ${tx}`;
  if (core) return core;
  return tx || "cancer";
}

function mergeTherapyQueryContextDto(
  dto: Partial<TherapyQueryContext> | undefined,
  lexical: TherapyQueryContext,
): TherapyQueryContext {
  if (!dto) return lexical;
  return {
    wantsMetastatic: dto.wantsMetastatic ?? lexical.wantsMetastatic,
    wantsAdjuvant: dto.wantsAdjuvant ?? lexical.wantsAdjuvant,
    wantsNeoadjuvant: dto.wantsNeoadjuvant ?? lexical.wantsNeoadjuvant,
    wantsResectedPostOp: dto.wantsResectedPostOp ?? lexical.wantsResectedPostOp,
    wantsLocallyAdvanced: dto.wantsLocallyAdvanced ?? lexical.wantsLocallyAdvanced,
    wantsMaintenance: dto.wantsMaintenance ?? lexical.wantsMaintenance,
    wantsSalvage: dto.wantsSalvage ?? lexical.wantsSalvage,
    wantsFirstLine: dto.wantsFirstLine ?? lexical.wantsFirstLine,
    wantsSecondLine: dto.wantsSecondLine ?? lexical.wantsSecondLine,
    wantsThirdLine: dto.wantsThirdLine ?? lexical.wantsThirdLine,
    wantsResectable: dto.wantsResectable ?? lexical.wantsResectable,
    wantsUnresectable: dto.wantsUnresectable ?? lexical.wantsUnresectable,
    explicitEarlyPhaseOk: dto.explicitEarlyPhaseOk ?? lexical.explicitEarlyPhaseOk,
    explicitFdaLanguage: dto.explicitFdaLanguage ?? lexical.explicitFdaLanguage,
  };
}

function mergeLlmWithLexical(
  dto: LlmExpansionPayload,
  lexical: ClinicalExpansion,
  provider: "openai" | "openrouter",
): ClinicalExpansion {
  const normalizedQuery = dto.normalizedQuery?.trim() || lexical.normalizedQuery;
  const fromLlmSubs = (dto.subqueries ?? []).map((s) => s.trim()).filter((s) => s.length > 2);
  const subqueries = uniqueStrings(
    [...fromLlmSubs, lexical.normalizedQuery, ...lexical.subqueries],
    16,
  );
  const fromLlmAnchors = (dto.anchors ?? []).map((s) => s.trim()).filter((s) => s.length > 1);
  const anchors = uniqueStrings([...fromLlmAnchors, ...lexical.anchors], 16);
  const treatmentIntent = dto.treatmentIntent ?? lexical.treatmentIntent;
  const therapeuticClinicalRetrieval =
    dto.therapeuticClinicalRetrieval ?? lexical.therapeuticClinicalRetrieval;
  const pdacExocrineIntent = dto.pdacExocrineIntent ?? lexical.pdacExocrineIntent;
  const approvalSocIntent = dto.approvalSocIntent ?? lexical.approvalSocIntent;
  const therapyQueryContext = mergeTherapyQueryContextDto(
    dto.therapyQueryContext,
    lexical.therapyQueryContext,
  );
  const fromLlmComp = (dto.competitorHints ?? []).map((s) => s.trim()).filter((s) => s.length > 2);
  const baseCompetitors = uniqueStrings([...fromLlmComp, ...lexical.competitorHints], 28);
  const competitorHints = pdacExocrineIntent
    ? uniqueStrings(
        [
          ...baseCompetitors,
          "neuroendocrine",
          "pancreatic neuroendocrine",
          "pnet",
          "islet cell",
          "carcinoid",
        ],
        32,
      )
    : baseCompetitors;
  const preferRecent = dto.preferRecent ?? lexical.preferRecent;
  const strongRecencyQuery = dto.strongRecencyQuery ?? lexical.strongRecencyQuery;
  let europePmcQuery = dto.europePmcQuery?.trim() ?? "";
  if (europePmcQuery.length < 12) {
    europePmcQuery = buildEpmcQuery(
      anchors.length > 0 ? anchors : [normalizedQuery],
      treatmentIntent,
      therapeuticClinicalRetrieval,
    );
  }
  if (europePmcQuery.length > 1800) {
    europePmcQuery = europePmcQuery.slice(0, 1800);
  }
  return {
    normalizedQuery,
    subqueries: subqueries.length > 0 ? subqueries : lexical.subqueries,
    anchors: anchors.length > 0 ? anchors : lexical.anchors,
    competitorHints,
    treatmentIntent,
    therapeuticClinicalRetrieval,
    pdacExocrineIntent,
    approvalSocIntent,
    therapyQueryContext,
    preferRecent,
    strongRecencyQuery,
    europePmcQuery,
    expansionProvider: provider,
  };
}

/**
 * Rule-based expansion (no API). Used as fallback and merged with OpenAI output.
 */
export function expandClinicalQueryLexical(raw: string): ClinicalExpansion {
  const normalizedQuery = raw.trim().replace(/\s+/g, " ");

  const treatmentIntent = TREATMENT_RE.test(normalizedQuery);
  const therapeuticClinicalRetrieval = inferTherapeuticClinicalRetrieval(
    normalizedQuery,
    treatmentIntent,
  );
  const preferRecent = RECENCY_RE.test(normalizedQuery);
  const strongRecencyQuery = STRONG_RECENCY_RE.test(normalizedQuery);

  const pancreaticSiteQuery =
    /\b(pancreat(ic|eas)|p\.?\s*d\.?\s*a\.?\s*c\.?\b|ductal\s+adenocarcinoma\s+of\s+the\s+pancreas)\b/i.test(
      normalizedQuery,
    );
  const querySuggestsNetFocus =
    /\b(neuroendocrine|pnet|pancreatic\s+nets?\b|islet\s+cell|carcinoid|gep-net|somatostatin)\b/i.test(
      normalizedQuery,
    );
  const pdacExocrineIntent =
    pancreaticSiteQuery && therapeuticClinicalRetrieval && !querySuggestsNetFocus;

  const approvalSocIntent = inferApprovalSocIntent(normalizedQuery, treatmentIntent);

  const therapyQueryContext = inferTherapyQueryContext(normalizedQuery);

  const pancreaticAdjuvantFocus =
    pancreaticSiteQuery &&
    therapeuticClinicalRetrieval &&
    (therapyQueryContext.wantsAdjuvant || therapyQueryContext.wantsResectedPostOp);

  const profile = SITE_PROFILES.find((p) => p.match.test(normalizedQuery));

  let anchors: string[] = [];
  let competitorHints: string[] = [];
  let extraSubs: string[] = [];

  if (profile) {
    anchors = [...profile.anchors];
    competitorHints = [...profile.competitors];
    const pancreasProfile = SITE_PROFILES[0];
    extraSubs =
      pancreaticAdjuvantFocus && profile === pancreasProfile
        ? [...PDAC_ADJUVANT_RESECTED_SUBQUERIES]
        : [...profile.extraSubqueries];
  } else if (/\bcancer\b|\bcarcinoma\b|\bneoplasm\b|\btumor\b|\boncolog/i.test(normalizedQuery)) {
    anchors = [normalizedQuery];
    competitorHints = [];
    extraSubs = [];
  }

  const subqueries: string[] = [normalizedQuery];

  if (treatmentIntent && anchors.length > 0) {
    const primary = anchors[0];
    if (pancreaticAdjuvantFocus) {
      subqueries.push(
        `${primary} adjuvant chemotherapy`,
        `${primary} adjuvant randomized trial`,
        `${primary} disease-free survival`,
      );
    } else {
      subqueries.push(
        `${primary} treatment`,
        `${primary} therapy clinical trial`,
        `${primary} targeted therapy`,
      );
    }
  }

  if (therapeuticClinicalRetrieval && anchors.length > 0) {
    const primary = anchors[0];
    if (pancreaticAdjuvantFocus) {
      subqueries.push(
        `${primary} adjuvant gemcitabine`,
        `${primary} adjuvant chemotherapy guideline`,
        `${primary} resected adjuvant FDA approved`,
        `${primary} NCCN adjuvant`,
      );
    } else {
      subqueries.push(
        `${primary} randomized clinical trial`,
        `${primary} overall survival`,
        `${primary} practice guideline`,
        `${primary} systematic review treatment`,
        `${primary} FDA approval`,
        `${primary} NCCN guideline`,
        `${primary} ESMO guideline`,
      );
    }
  }

  if (strongRecencyQuery && anchors.length > 0) {
    const primary = anchors[0];
    subqueries.push(`${primary} guideline update`, `${primary} regulatory approval`);
  }

  subqueries.push(...extraSubs);

  if (treatmentIntent && /\bpancreat(ic|eas)/i.test(normalizedQuery) && !pancreaticAdjuvantFocus) {
    subqueries.push(
      "pancreatic cancer guideline therapy",
      "pancreatic cancer immunotherapy checkpoint",
      "pancreatic cancer stroma targeted therapy",
    );
  }

  if (therapeuticClinicalRetrieval && pancreaticSiteQuery && therapyQueryContext.wantsMetastatic) {
    subqueries.push(
      "metastatic pancreatic cancer first line chemotherapy",
      "advanced pancreatic ductal adenocarcinoma systemic therapy",
      "unresectable metastatic pancreatic cancer FOLFIRINOX gemcitabine",
    );
  }

  const europePmcQuery = buildEpmcQuery(
    anchors.length > 0 ? anchors : [normalizedQuery],
    treatmentIntent,
    therapeuticClinicalRetrieval,
  );

  const mergedCompetitors = pdacExocrineIntent
    ? uniqueStrings(
        [
          ...competitorHints,
          "neuroendocrine",
          "pancreatic neuroendocrine",
          "pnet",
          "islet cell",
          "carcinoid",
        ],
        32,
      )
    : competitorHints;

  return {
    normalizedQuery,
    subqueries: uniqueStrings(subqueries, 16),
    anchors: uniqueStrings(anchors.length > 0 ? anchors : [normalizedQuery], 14),
    competitorHints: mergedCompetitors,
    treatmentIntent,
    therapeuticClinicalRetrieval,
    pdacExocrineIntent,
    approvalSocIntent,
    therapyQueryContext,
    preferRecent,
    strongRecencyQuery,
    europePmcQuery,
    expansionProvider: "lexical",
  };
}

function llmPayloadUsable(llm: LlmExpansionPayload | null): boolean {
  if (!llm) return false;
  return (
    (llm.subqueries?.length ?? 0) > 0 ||
    (llm.anchors?.length ?? 0) > 0 ||
    (llm.europePmcQuery?.trim().length ?? 0) > 12
  );
}

/**
 * LLM expansion: `OPENAI_API_KEY` (direct) first, else `OPENROUTER_API_KEY`, else lexical-only.
 */
export async function expandClinicalQuery(raw: string): Promise<ClinicalExpansion> {
  const lexical = expandClinicalQueryLexical(raw);

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    const model = process.env.OPENAI_EXPANSION_MODEL?.trim() || "gpt-4.1-mini";
    try {
      const llm = await fetchOpenAiClinicalExpansion(raw, openaiKey, model);
      if (llmPayloadUsable(llm)) {
        return mergeLlmWithLexical(llm!, lexical, "openai");
      }
    } catch {
      /* try OpenRouter or lexical */
    }
  }

  const orKey = process.env.OPENROUTER_API_KEY?.trim();
  if (orKey) {
    const orModel = process.env.OPENROUTER_CHAT_MODEL?.trim() || "openai/gpt-4o-mini";
    try {
      const llm = await fetchOpenRouterClinicalExpansion(raw, orKey, orModel);
      if (llmPayloadUsable(llm)) {
        return mergeLlmWithLexical(llm!, lexical, "openrouter");
      }
    } catch {
      /* lexical */
    }
  }

  return { ...lexical, expansionProvider: "lexical" };
}
