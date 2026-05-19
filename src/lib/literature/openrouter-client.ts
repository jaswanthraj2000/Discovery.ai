/** OpenRouter unified API (chat + rerank) — one key replaces direct OpenAI/Cohere when configured. */

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_RERANK_URL = "https://openrouter.ai/api/v1/rerank";

export function buildOpenRouterHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
  if (referer) {
    headers["HTTP-Referer"] = referer;
  }
  headers["X-Title"] = process.env.OPENROUTER_APP_TITLE?.trim() || "Discovery OS";
  return headers;
}
