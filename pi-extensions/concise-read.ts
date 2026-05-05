/**
 * Concise Read Output Extension
 *
 * Suppresses read tool results from printing in the TUI.
 * Users can still inspect results with Ctrl+O.
 *
 * Usage:
 *   pi -e ./concise-read.ts
 * Or place in ~/.pi/agent/extensions/ for auto-discovery
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createReadTool, getTextOutput } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
  const originalRead = createReadTool(process.cwd());

  pi.registerTool({
    name: "read",
    label: originalRead.label,
    description: originalRead.description,
    parameters: originalRead.parameters,

    async execute(toolCallId, params, signal, onUpdate) {
      return originalRead.execute(toolCallId, params, signal, onUpdate);
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("read "));
      text += theme.fg("accent", args.path ?? "");
      if (args.offset !== undefined || args.limit !== undefined) {
        const parts: string[] = [];
        if (args.offset !== undefined) parts.push(`offset=${args.offset}`);
        if (args.limit !== undefined) parts.push(`limit=${args.limit}`);
        text += theme.fg("dim", ` (${parts.join(", ")})`);
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme) {
      // Show brief indicator during execution
      if (isPartial) {
        return new Text(theme.fg("muted", "reading..."), 0, 0);
      }
      // When expanded (Ctrl+O), show the full result
      if (expanded) {
        const output = getTextOutput(result, false);
        return new Text(output.split("\n").map((l) => theme.fg("toolOutput", l)).join("\n"), 0, 0);
      }
      // Collapsed: hide output
      return new Text("", 0, 0);
    },
  });
}
