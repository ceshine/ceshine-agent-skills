/**
 * Captures token usage, API, provider, and model info for branch_summary
 * entries that Pi normally discards.
 *
 * Hooks into session_before_tree to replace Pi's default summarizer with
 * one that preserves the API response metadata (usage, api, provider,
 * model) in the branch_summary entry's details field.
 *
 * After installation, branch_summary entries in session JSONL files
 * will include `details.usage`, `details.api`, `details.provider`,
 * and `details.model` alongside the existing `readFiles`/`modifiedFiles`.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import { complete } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
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
// Prompt strings (mirroring pi's internal branch-summarization.js)
// ---------------------------------------------------------------------------

const BRANCH_SUMMARY_PREAMBLE = `The user explored a different conversation branch before returning here.
Summary of that exploration:

`;

const SUMMARIZATION_SYSTEM_PROMPT = `You are a context summarization assistant. Your task is to read a conversation between a user and an AI coding assistant, then produce a structured summary following the exact format specified.

Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.`;

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

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  pi.on("session_before_tree", async (event: SessionBeforeTreeEvent, ctx) => {
    const { preparation, signal } = event;

    // Only intercept when the user actually wants a summary
    if (
      !preparation.userWantsSummary ||
      preparation.entriesToSummarize.length === 0
    ) {
      return; // Let pi handle normally
    }

    const model = ctx.model;
    if (!model) throw new Error("branch-summary-usage: no model available");

    // Resolve API key and headers
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok || !auth.apiKey) throw new Error(`branch-summary-usage: auth failed (${auth.error ?? "no api key"})`);

    const { entriesToSummarize, customInstructions, replaceInstructions } =
      preparation;

    const reserveTokens = 16384; // Default (matches pi core)
    const contextWindow = model.contextWindow || 128000;
    const tokenBudget = contextWindow - reserveTokens;

    // Prepare entries (same token-budget logic as pi core)
    const { messages } = prepareBranchEntries(entriesToSummarize, tokenBudget);
    if (messages.length === 0) {
      return {
        summary: { summary: "No content to summarize", details: {} },
      };
    }

    // Serialize conversation to text
    const llmMessages = convertToLlm(messages);
    const conversationText = serializeConversation(llmMessages);

    // Build instructions
    let instructions: string;
    if (replaceInstructions && customInstructions) {
      instructions = customInstructions;
    } else if (customInstructions) {
      instructions = `${BRANCH_SUMMARY_PROMPT}\n\nAdditional focus: ${customInstructions}`;
    } else {
      instructions = BRANCH_SUMMARY_PROMPT;
    }

    const promptText = `<conversation>\n${conversationText}\n</conversation>\n\n${instructions}`;

    // Call the LLM directly — this is where we capture usage!
    let response: AssistantMessage;
    try {
      response = await complete(
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
        {
          apiKey: auth.apiKey,
          headers: auth.headers,
          signal,
          maxTokens: 2048,
        },
      );
    } catch (err) {
      throw new Error(
        `branch-summary-usage: summarization failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (response.stopReason === "aborted" || response.stopReason === "error") {
      return; // Let pi's default handle edge cases
    }

    let summary = response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    summary = BRANCH_SUMMARY_PREAMBLE + summary;

    // Compute file lists (same logic as pi core)
    const fileOps = createFileOps();
    for (const entry of entriesToSummarize) {
      // Harvest file ops from nested branch_summary entries
      if (entry.type === "branch_summary" && !entry.fromHook && entry.details) {
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
      // Harvest file ops from assistant messages (tool calls)
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
          // ✦ These are the fields Pi's default summarizer discards ✦
          usage: response.usage,
          api: response.api,
          provider: response.provider,
          model: response.model,
        },
      },
    };
  });
}
