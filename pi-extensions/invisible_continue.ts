/**
 * pi-invisible-continue — resume the agentic loop without the LLM seeing any new prompt.
 *
 * Strategy:
 *
 *   - /continue command calls pi.sendMessage() with a custom-type message
 *   - Default convertToLlm filters to user/assistant/toolResult only → custom message stripped
 *   - LLM receives unchanged context, loops naturally as if agent.continue() were called
 *   - Session gets one hidden entry (customType: "continue", display: false)
 *
 * Cleaner than any existing package: no "continue" user-message pollution, no handoff doc,
 * no retry text.  The LLM never sees a new message.
 *
 * Adapted from https://github.com/monotykamary/pi-invisible-continue
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

/** Custom type used for the invisible trigger message. */
export const CONTINUE_CUSTOM_TYPE = "__invisible_continue";

/** Description shown in the / commands list. */
export const CONTINUE_COMMAND_DESCRIPTION =
  "Resume the agentic loop without sending a prompt the LLM can read";

/**
 * Extract the text content of the last assistant message in the session.
 * Returns undefined if no assistant message exists.
 */
export function getLastAssistantMessageText(
  entries: ReadonlyArray<{
    type: string;
    message?: { role?: string; content?: unknown };
  }>,
): string | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (
      entry.type === "message" &&
      entry.message?.role === "assistant" &&
      entry.message?.content
    ) {
      const content = entry.message.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        const textBlocks = content.filter(
          (block: any): block is { type: "text"; text: string } =>
            typeof block === "object" &&
            block !== null &&
            block.type === "text" &&
            typeof block.text === "string",
        );
        if (textBlocks.length === 0) return undefined;
        return textBlocks.map((block) => block.text).join("\n");
      }
    }
  }
  return undefined;
}

/** Format last assistant text, truncating with `…` if too long. */
function formatLastAssistant(text: string | undefined): string {
  if (text === undefined) return "(none)";
  if (text.length <= 120) return text;
  return text.slice(0, 119) + "…";
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("continue", {
    description: CONTINUE_COMMAND_DESCRIPTION,
    handler: async (args, ctx) => {
      await runContinueCommand(pi, ctx, args);
    },
  });

  // Strip hidden continue markers from context before each LLM call.
  // This is insurance — convertToLlm already filters custom roles, but a
  // custom convertToLlm override could leak them.  Clean proactively.
  pi.on("context", async (event) => {
    const cleaned = event.messages.filter(
      (msg: any) =>
        !(msg.role === "custom" && msg.customType === CONTINUE_CUSTOM_TYPE),
    );
    if (cleaned.length !== event.messages.length) {
      return { messages: cleaned };
    }
  });
}

async function runContinueCommand(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  args: string,
): Promise<void> {
  // ---- subcommand: status -------------------------------------------------
  if (args.trim().toLowerCase() === "status") {
    const last = getLastAssistantMessageText(ctx.sessionManager.getEntries());
    const idle = ctx.isIdle();
    ctx.ui.notify(
      [
        "pi-invisible-continue status:",
        `  Agent idle: ${idle ? "yes" : "no"}`,
        `  Last assistant: ${formatLastAssistant(last)}`,
      ].join("\n"),
      "info",
    );
    return;
  }

  // ---- subcommand: help ---------------------------------------------------
  if (args.trim().toLowerCase() === "help") {
    ctx.ui.notify(
      [
        "pi-invisible-continue  /continue     Resume loop invisibly",
        "                        /continue status  Show diagnostics",
        "                        /continue help    This message",
      ].join("\n"),
      "info",
    );
    return;
  }

  // ---- main: fire invisible continue --------------------------------------
  if (!ctx.isIdle()) {
    await ctx.waitForIdle();
  }

  pi.sendMessage(
    {
      customType: CONTINUE_CUSTOM_TYPE,
      content: "",
      display: false,
      details: {},
    },
    { triggerTurn: true },
  );
}
