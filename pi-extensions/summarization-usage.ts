/**
 * Captures token usage, API, provider, and model info for summarization
 * operations that Pi normally discards.
 *
 * Hooks into both:
 * - session_before_tree (branch summaries)
 * - session_before_compact (context compaction)
 *
 * After installation, branch_summary and compaction entries in session
 * JSONL files will include `details.usage`, `details.api`,
 * `details.provider`, and `details.model`.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import { complete } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  SessionBeforeCompactEvent,
  SessionBeforeTreeEvent,
} from "@earendil-works/pi-coding-agent";
import {
  convertToLlm,
  prepareBranchEntries,
  serializeConversation,
} from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Inlined utilities (not exported from pi's public API, copied from
// dist/core/compaction/utils.js)
// ---------------------------------------------------------------------------

interface FileOps {
  read: Set<string>;
  written: Set<string>;
  edited: Set<string>;
}

function createFileOps(): FileOps {
  return { read: new Set(), written: new Set(), edited: new Set() };
}

function extractFileOpsFromMessage(
  message: { role?: string; content?: unknown },
  fileOps: FileOps,
): void {
  if (message.role !== "assistant") return;
  if (!("content" in message) || !Array.isArray(message.content)) return;
  for (const block of message.content) {
    if (typeof block !== "object" || block === null) continue;
    if (!("type" in block) || block.type !== "toolCall") continue;
    if (!("arguments" in block) || !("name" in block)) continue;
    const args = block.arguments as Record<string, unknown> | undefined;
    if (!args) continue;
    const path = typeof args.path === "string" ? args.path : undefined;
    if (!path) continue;
    switch (block.name) {
      case "read":
        fileOps.read.add(path);
        break;
      case "write":
        fileOps.written.add(path);
        break;
      case "edit":
        fileOps.edited.add(path);
        break;
    }
  }
}

function computeFileLists(fileOps: FileOps): {
  readFiles: string[];
  modifiedFiles: string[];
} {
  const modified = new Set([...fileOps.edited, ...fileOps.written]);
  const readOnly = [...fileOps.read].filter((f) => !modified.has(f)).sort();
  const modifiedFiles = [...modified].sort();
  return { readFiles: readOnly, modifiedFiles };
}

function formatFileOperations(
  readFiles: string[],
  modifiedFiles: string[],
): string {
  const sections: string[] = [];
  if (readFiles.length > 0) {
    sections.push(`<read-files>\n${readFiles.join("\n")}\n</read-files>`);
  }
  if (modifiedFiles.length > 0) {
    sections.push(
      `<modified-files>\n${modifiedFiles.join("\n")}\n</modified-files>`,
    );
  }
  if (sections.length === 0) return "";
  return `\n\n${sections.join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// Prompt strings
// ---------------------------------------------------------------------------

const SUMMARIZATION_SYSTEM_PROMPT = `You are a context summarization assistant. Your task is to read a conversation between a user and an AI coding assistant, then produce a structured summary following the exact format specified.

Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.`;

const BRANCH_SUMMARY_PREAMBLE = `The user explored a different conversation branch before returning here.
Summary of that exploration:

`;

const BRANCH_SUMMARY_PROMPT = `Create a structured summary of this conversation branch for context when returning later.

Use this EXACT format:

## Goal
[What was the user trying to accomplish in this branch?]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned]
- [Or "(none)" if none were mentioned]

## Progress
### Done
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Work that was started but not finished]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [What should happen next to continue this work]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

const COMPACTION_PROMPT = `The messages above are a conversation to summarize. Create a structured context checkpoint summary that another LLM will use to continue the work.

Use this EXACT format:

## Goal
[What is the user trying to accomplish? Can be multiple items if the session covers different tasks.]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned by user]
- [Or "(none)" if none were mentioned]

## Progress
### Done
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Current work]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [Ordered list of what should happen next]

## Critical Context
- [Any data, examples, or references needed to continue]
- [Or "(none)" if not applicable]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

const UPDATE_COMPACTION_PROMPT = `The messages above are NEW conversation messages to incorporate into the existing summary provided in <previous-summary> tags.

Update the existing structured summary with new information. RULES:
- PRESERVE all existing information from the previous summary
- ADD new progress, decisions, and context from the new messages
- UPDATE the Progress section: move items from "In Progress" to "Done" when completed
- UPDATE "Next Steps" based on what was accomplished
- PRESERVE exact file paths, function names, and error messages
- If something is no longer relevant, you may remove it

Use this EXACT format:

## Goal
[Preserve existing goals, add new ones if the task expanded]

## Constraints & Preferences
- [Preserve existing, add new ones discovered]

## Progress
### Done
- [x] [Include previously done items AND newly completed items]

### In Progress
- [ ] [Current work - update based on progress]

### Blocked
- [Current blockers - remove if resolved]

## Key Decisions
- **[Decision]**: [Brief rationale] (preserve all previous, add new)

## Next Steps
1. [Update based on current state]

## Critical Context
- [Preserve important context, add new if needed]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

const TURN_PREFIX_PROMPT = `This is the PREFIX of a turn that was too large to keep. The SUFFIX (recent work) is retained.

Summarize the prefix to provide context for the retained suffix:

## Original Request
[What did the user ask for in this turn?]

## Early Progress
- [Key decisions and work done in the prefix]

## Context for Suffix
- [Information needed to understand the retained recent work]

Be concise. Focus on what's needed to understand the kept suffix.`;

// ---------------------------------------------------------------------------
// Shared LLM caller
// ---------------------------------------------------------------------------

interface LlmAuth {
  apiKey: string;
  headers?: Record<string, string>;
}

async function callLlm(
  model: import("@earendil-works/pi-ai").Model<
    import("@earendil-works/pi-ai").Api
  >,
  auth: LlmAuth,
  signal: AbortSignal,
  promptText: string,
  maxTokens: number,
): Promise<AssistantMessage> {
  return complete(
    model,
    {
      systemPrompt: SUMMARIZATION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: promptText }],
          timestamp: Date.now(),
        },
      ],
    },
    { apiKey: auth.apiKey, headers: auth.headers, signal, maxTokens },
  );
}

function extractText(response: AssistantMessage): string {
  return response.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // ── Branch summary (/tree) ────────────────────────────────────────────
  pi.on(
    "session_before_tree",
    async (event: SessionBeforeTreeEvent, ctx) => {
      const { preparation, signal } = event;

      if (
        !preparation.userWantsSummary ||
        preparation.entriesToSummarize.length === 0
      ) {
        return;
      }

      const model = ctx.model;
      if (!model) throw new Error("summarization-usage: no model available");

      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth.ok || !auth.apiKey)
        throw new Error(
          `summarization-usage: auth failed (${auth.error ?? "no api key"})`,
        );

      const { entriesToSummarize, customInstructions, replaceInstructions } =
        preparation;

      const reserveTokens = 16384;
      const contextWindow = model.contextWindow || 128000;
      const tokenBudget = contextWindow - reserveTokens;

      const { messages } = prepareBranchEntries(
        entriesToSummarize,
        tokenBudget,
      );
      if (messages.length === 0) {
        return {
          summary: { summary: "No content to summarize", details: {} },
        };
      }

      const llmMessages = convertToLlm(messages);
      const conversationText = serializeConversation(llmMessages);

      let instructions: string;
      if (replaceInstructions && customInstructions) {
        instructions = customInstructions;
      } else if (customInstructions) {
        instructions = `${BRANCH_SUMMARY_PROMPT}\n\nAdditional focus: ${customInstructions}`;
      } else {
        instructions = BRANCH_SUMMARY_PROMPT;
      }

      const promptText = `<conversation>\n${conversationText}\n</conversation>\n\n${instructions}`;

      let response: AssistantMessage;
      try {
        response = await callLlm(
          model,
          { apiKey: auth.apiKey, headers: auth.headers },
          signal,
          promptText,
          2048,
        );
      } catch (err) {
        throw new Error(
          `summarization-usage: branch summarization failed — ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (
        response.stopReason === "aborted" ||
        response.stopReason === "error"
      ) {
        return;
      }

      let summary = BRANCH_SUMMARY_PREAMBLE + extractText(response);

      // Extract file ops from entries
      const fileOps = createFileOps();
      for (const entry of entriesToSummarize) {
        if (
          entry.type === "branch_summary" &&
          !entry.fromHook &&
          entry.details
        ) {
          const details = entry.details as {
            readFiles?: unknown;
            modifiedFiles?: unknown;
          };
          if (Array.isArray(details.readFiles)) {
            for (const f of details.readFiles) fileOps.read.add(f as string);
          }
          if (Array.isArray(details.modifiedFiles)) {
            for (const f of details.modifiedFiles)
              fileOps.edited.add(f as string);
          }
        }
        if (entry.type === "message" && entry.message) {
          extractFileOpsFromMessage(entry.message, fileOps);
        }
      }
      const { readFiles, modifiedFiles } = computeFileLists(fileOps);
      summary += formatFileOperations(readFiles, modifiedFiles);

      return {
        summary: {
          summary: summary || "No summary generated",
          details: {
            readFiles,
            modifiedFiles,
            usage: response.usage,
            api: response.api,
            provider: response.provider,
            model: response.model,
          },
        },
      };
    },
  );

  // ── Compaction (/compact) ─────────────────────────────────────────────
  pi.on(
    "session_before_compact",
    async (event: SessionBeforeCompactEvent, ctx) => {
      const { preparation, customInstructions, signal } = event;

      const model = ctx.model;
      if (!model) return;

      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth.ok || !auth.apiKey) return;

      const {
        messagesToSummarize,
        turnPrefixMessages,
        isSplitTurn,
        tokensBefore,
        previousSummary,
        fileOps: prepFileOps,
        settings,
        firstKeptEntryId,
      } = preparation;

      const fileOps = createFileOps();
      if (prepFileOps) {
        for (const f of prepFileOps.read) fileOps.read.add(f);
        for (const f of prepFileOps.written) fileOps.written.add(f);
        for (const f of prepFileOps.edited) fileOps.edited.add(f);
      }

      const reserveTokens = settings.reserveTokens || 16384;
      const llmAuth: LlmAuth = {
        apiKey: auth.apiKey,
        headers: auth.headers,
      };

      let summary: string;
      let mainResponse: AssistantMessage | undefined;

      if (isSplitTurn && turnPrefixMessages.length > 0) {
        const maxTokensHistory = Math.floor(0.8 * reserveTokens);
        const maxTokensPrefix = Math.floor(0.5 * reserveTokens);

        let basePrompt = previousSummary
          ? UPDATE_COMPACTION_PROMPT
          : COMPACTION_PROMPT;
        if (customInstructions) {
          basePrompt = `${basePrompt}\n\nAdditional focus: ${customInstructions}`;
        }

        const llmMessages = convertToLlm(messagesToSummarize);
        const conversationText = serializeConversation(llmMessages);
        let promptText = `<conversation>\n${conversationText}\n</conversation>\n\n`;
        if (previousSummary) {
          promptText += `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`;
        }
        promptText += basePrompt;

        const prefixLlmMessages = convertToLlm(turnPrefixMessages);
        const prefixConversationText = serializeConversation(prefixLlmMessages);
        const prefixPromptText = `<conversation>\n${prefixConversationText}\n</conversation>\n\n${TURN_PREFIX_PROMPT}`;

        const [historyResponse, prefixResponse] = await Promise.all([
          messagesToSummarize.length > 0
            ? callLlm(
                model,
                llmAuth,
                signal,
                promptText,
                maxTokensHistory,
              )
            : Promise.resolve(undefined),
          callLlm(model, llmAuth, signal, prefixPromptText, maxTokensPrefix),
        ]);

        const historyText = historyResponse
          ? extractText(historyResponse)
          : "No prior history.";
        const prefixText = extractText(prefixResponse);

        summary = `${historyText}\n\n---\n\n**Turn Context (split turn):**\n\n${prefixText}`;
        mainResponse = historyResponse ?? prefixResponse;
      } else {
        let basePrompt = previousSummary
          ? UPDATE_COMPACTION_PROMPT
          : COMPACTION_PROMPT;
        if (customInstructions) {
          basePrompt = `${basePrompt}\n\nAdditional focus: ${customInstructions}`;
        }

        const llmMessages = convertToLlm(messagesToSummarize);
        const conversationText = serializeConversation(llmMessages);
        let promptText = `<conversation>\n${conversationText}\n</conversation>\n\n`;
        if (previousSummary) {
          promptText += `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`;
        }
        promptText += basePrompt;

        const maxTokens = Math.floor(0.8 * reserveTokens);

        const response = await callLlm(
          model,
          llmAuth,
          signal,
          promptText,
          maxTokens,
        );

        if (
          response.stopReason === "aborted" ||
          response.stopReason === "error"
        ) {
          return;
        }

        summary = extractText(response);
        mainResponse = response;
      }

      const { readFiles, modifiedFiles } = computeFileLists(fileOps);
      summary += formatFileOperations(readFiles, modifiedFiles);

      return {
        compaction: {
          summary: summary || "No summary generated",
          firstKeptEntryId,
          tokensBefore,
          details: {
            readFiles,
            modifiedFiles,
            usage: mainResponse?.usage,
            api: mainResponse?.api,
            provider: mainResponse?.provider,
            model: mainResponse?.model,
          },
        },
      };
    },
  );
}
