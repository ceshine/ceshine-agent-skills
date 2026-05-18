/**
 * Pi Coding Agent extension for CrofAI.
 *
 * Fetches available models from the CrofAI API, maps them to Pi's provider
 * format (including reasoning capabilities, vision support, and pricing),
 * and registers the "crofai" provider with the agent.
 *
 * API key resolution (priority order):
 *   1. auth.json entry for "crofai" (set via `/login` → "Use an API key")
 *   2. CROFAI_API_KEY environment variable
 *
 * Copied from the nahcrof Discord server (https://discord.com/channels/1175276136083755008/1478093814529921135/1501132196021272669)
 *
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

interface CrofAIModel {
  id: string;
  name: string;
  context_length: number;
  max_completion_tokens: number;
  pricing: {
    prompt: string;
    completion: string;
    cache_prompt?: string;
  };
  quantization: string;
  speed: number;
  reasoning_effort?: boolean;
  custom_reasoning?: boolean;
}

interface UsageData {
  usable_requests: number | null;
  credits: number;
}

interface CrofAIResponse {
  data: CrofAIModel[];
}

const VISION_MODELS = new Set([
  "kimi-k2.6",
  "kimi-k2.6-precision",
  "kimi-k2.5",
  "kimi-k2.5-lightning",
  "gemma-4-31b-it",
  "qwen3.6-27b",
  "qwen3.5-397b-a17b",
  "qwen3.5-9b",
  "qwen3.5-9b-chat",
]);

function mapModels(models: CrofAIModel[]) {
  return models.map((m) => {
    const reasoning =
      m.reasoning_effort === true || m.custom_reasoning === true;

    return {
      id: m.id,
      name: m.name,
      api: "openai-completions",
      reasoning,
      input: VISION_MODELS.has(m.id)
        ? (["text", "image"] as const)
        : (["text"] as const),
      contextWindow: m.context_length,
      maxTokens: m.max_completion_tokens,
      cost: {
        // CrofAI's /v1/models pricing fields are already dollars per million tokens,
        // which is exactly what pi expects. Do not multiply by 1_000_000 here.
        input: parseFloat(m.pricing.prompt),
        output: parseFloat(m.pricing.completion),
        cacheRead: parseFloat(m.pricing.cache_prompt ?? "0"),
        cacheWrite: 0,
      },
      ...(reasoning
        ? {
            thinkingLevelMap: {
              off: "none",
              minimal: "low",
              low: "low",
              medium: "medium",
              high: "high",
              xhigh: "high",
            },
            compat: {
              supportsReasoningEffort: true,
            },
          }
        : {}),
    };
  });
}

async function fetchModels() {
  const res = await fetch("https://crof.ai/v1/models");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { data } = (await res.json()) as CrofAIResponse;
  return data;
}

async function updateUsageStatus(ctx: any) {
  try {
    const apiKey = await ctx.modelRegistry.getApiKeyForProvider("crofai");
    if (!apiKey) {
      ctx.ui.setStatus("usage-crofai", ctx.ui.theme.fg("warning", "crofai: no API key"));
      return;
    }

    const res = await fetch("https://crof.ai/usage_api/", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      ctx.ui.setStatus("usage-crofai", ctx.ui.theme.fg("error", "crofai: API error"));
      return;
    }

    const data = (await res.json()) as UsageData;
    const parts: string[] = [];

    if (data.usable_requests !== null && data.usable_requests !== undefined) {
      parts.push(`${data.usable_requests} reqs left`);
    }
    if (data.credits !== undefined && data.credits > 0) {
      parts.push(`$${data.credits.toFixed(4)}`);
    }

    ctx.ui.setStatus("usage-crofai", `crofai: ${parts.join(" | ")}`);
  } catch {
    ctx.ui.setStatus("usage-crofai", ctx.ui.theme.fg("error", "crofai: fetch failed"));
  }
}

export default async function (pi: ExtensionAPI) {
  let models: CrofAIModel[];

  try {
    models = await fetchModels();
  } catch (err) {
    console.error(`[crofai] Failed to fetch models: ${err}`);
    return;
  }

  pi.registerProvider("crofai", {
    baseUrl: "https://crof.ai/v1",
    apiKey: "CROFAI_API_KEY",
    api: "openai-completions",
    models: mapModels(models),
  });

  // Usage status — fetch on start and after every agent response
  pi.on("session_start", async (_event, ctx) => {
    updateUsageStatus(ctx); // fire-and-forget
  });

  pi.on("agent_end", async (_event, ctx) => {
    updateUsageStatus(ctx); // fire-and-forget
  });

  // How the API key gets resolved (in priority order):
  //   1. auth.json entry for "crofai" (set via `/login` → "Use an API key")
  //   2. CROFAI_API_KEY environment variable
  //
  // If neither is set, Pi shows: "No API key found for crofai. Use /login..."
  // Run `/login` → "Use an API key" → select "crofai" → paste key → saved to auth.json
}
