import {
  LLM_EXPANSION_SYSTEM_PROMPT,
  safeParseLlmExpansionJson,
  type LlmExpansionPayload,
} from "@/lib/literature/openai-expansion";
import { OPENROUTER_CHAT_URL, buildOpenRouterHeaders } from "@/lib/literature/openrouter-client";

/**
 * OpenRouter chat completions (OpenAI-compatible) for structured expansion JSON.
 */
export async function fetchOpenRouterClinicalExpansion(
  userQuery: string,
  apiKey: string,
  model: string,
): Promise<LlmExpansionPayload | null> {
  const res = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: buildOpenRouterHeaders(apiKey),
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
