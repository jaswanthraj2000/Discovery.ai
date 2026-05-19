import type { TherapyQueryContext } from "@/lib/literature/therapy-context";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

/** Partial shape returned by the model (validated before merge). */
export type LlmExpansionPayload = {
  normalizedQuery?: string;
  subqueries?: string[];
  anchors?: string[];
  competitorHints?: string[];
  treatmentIntent?: boolean;
  /** When true with treatment/outcomes queries, bias retrieval toward human trials, guidelines, survival — not bench biomarkers. */
  therapeuticClinicalRetrieval?: boolean;
  preferRecent?: boolean;
  /** True when query emphasizes latest/recent/emerging — strengthens publication-year preference in reranking. */
  strongRecencyQuery?: boolean;
  /** True when the question targets pancreatic ductal / exocrine cancer (not neuroendocrine) — used to downrank NET titles. */
  pdacExocrineIntent?: boolean;
  /** True when the user wants FDA-approved / SOC / frontline / Category 1–style evidence — strengthens regimen ontology boosts and early-phase penalties. */
  approvalSocIntent?: boolean;
  /** Optional overrides for treatment-setting parsing (merged with lexical inference). */
  therapyQueryContext?: Partial<TherapyQueryContext>;
  europePmcQuery?: string;
};

export const LLM_EXPANSION_SYSTEM_PROMPT = `You are a biomedical information retrieval assistant. Given a user's research question, produce a JSON object for searching OpenAlex and Europe PMC.

Rules:
1. Preserve the user's disease/condition with EXACT matching phrases in "anchors" (include common synonyms, abbreviations, and histology-specific names, e.g. PDAC for pancreatic ductal adenocarcinoma).
2. If the user asks about treatments, trials, or "latest" care, set treatmentIntent true and preferRecent true when they imply recency.
3. "subqueries": 6–12 DISTINCT short search strings optimized for academic indexes (therapy, targeted agents, immunotherapy, chemotherapy, trials, guidelines). Include the original intent, not generic "cancer" only.
4. "competitorHints": other primary cancer sites or unrelated organ diseases that should NOT dominate results (e.g. for pancreatic cancer include colorectal, breast, lung, gastric, etc.) when the query is site-specific.
5. "europePmcQuery": a single Europe PMC style boolean query using TITLE/ABSTRACT grouped ORs for anchors AND therapy/outcomes terms when treatmentIntent or therapeuticClinicalRetrieval is true (include survival, efficacy, guideline, randomized). Keep under 1800 characters.
6. "therapeuticClinicalRetrieval": true when the user wants treatments, drugs, trials, survival, guidelines, or clinical efficacy — false for purely mechanistic/diagnostic questions.
7. "strongRecencyQuery": true when the query emphasizes latest, recent, new, emerging, updated, or current evidence — triggers stronger preference for newer publications in ranking.
8. When therapeuticClinicalRetrieval is true, include sub-queries mentioning FDA approval, NCCN/ESMO guidelines, or standard-of-care where relevant.
9. "pdacExocrineIntent": true when the query is about pancreatic ductal adenocarcinoma / exocrine pancreatic cancer therapy or outcomes and is NOT primarily about neuroendocrine tumors, pNET, islet cell tumors, or carcinoid — false otherwise.
10. "approvalSocIntent": true when the user asks for FDA-approved therapy, standard of care, frontline or NCCN Category 1–style regimens, or names concrete SOC combinations (e.g. FOLFIRINOX, gemcitabine+nab-paclitaxel) — false for purely exploratory or preclinical questions.
11. "therapyQueryContext" (optional): include only fields you are confident about, using booleans: wantsMetastatic, wantsAdjuvant, wantsNeoadjuvant, wantsResectedPostOp (resected/postoperative/after resection), wantsLocallyAdvanced, wantsMaintenance, wantsSalvage, wantsFirstLine, wantsSecondLine, wantsThirdLine, explicitEarlyPhaseOk, explicitFdaLanguage.
12. Output ONLY valid JSON with keys: normalizedQuery, subqueries, anchors, competitorHints, treatmentIntent, therapeuticClinicalRetrieval (boolean), pdacExocrineIntent (boolean), approvalSocIntent (boolean), therapyQueryContext (optional object), preferRecent, strongRecencyQuery (boolean), europePmcQuery. No markdown or commentary.`;

export function safeParseLlmExpansionJson(text: string): LlmExpansionPayload | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as LlmExpansionPayload;
  } catch {
    return null;
  }
}

/**
 * Calls OpenAI for structured query expansion. Returns null on missing key or API failure.
 */
export async function fetchOpenAiClinicalExpansion(
  userQuery: string,
  apiKey: string,
  model: string,
): Promise<LlmExpansionPayload | null> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: LLM_EXPANSION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Research question: ${userQuery.slice(0, 2000)}`,
        },
      ],
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  return safeParseLlmExpansionJson(content);
}
