/**
 * /context
 *
 * Small TUI view showing what's loaded/available:
 *
 * - extensions (best-effort from registered extension slash commands)
 * - skills
 * - project context files (AGENTS.md / CLAUDE.md)
 * - current context window usage + session totals (tokens/cost)
 *
 * Adapted from: https://github.com/mitsuhiko/agent-stuff/blob/521cafdb9ed3923e8ace90c5af9d2c7d92c10f86/extensions/context.ts
 *
 * ── Token estimation heuristics ──
 *
 * Context window usage has three possible states:
 *
 *   1. **null** — no model loaded, context window unknown
 *   2. **"unknown"** — model loaded, context window known, but token count
 *      unavailable because there's no completed LLM response to anchor
 *      the estimate (fresh session, post-compaction, or all responses
 *      aborted/errored). In this state we show "waiting for first LLM response".
 *   3. **known** — tracked by pi's getContextUsage(), which uses a hybrid
 *      approach: real inputTokens from the last completed API response,
 *      plus chars/4 estimation for any messages added since that response.
 *
 * Why "unknown" exists: pi's estimateContextTokens() falls back to pure
 * chars/4 heuristics when there's no assistant usage data in the session.
 * In a fresh session this produces a tiny non-null number (just system
 * prompt bytes ÷ 4) that looks precise but isn't grounded in any real
 * API measurement. We suppress it to avoid misleading confidence.
 *
 * Tool definition tokens are NOT added separately to effectiveTokens below
 * because Pi injects tool descriptions directly into the system prompt
 * (see AgentSession._rebuildSystemPrompt in agent-session.js). When tools
 * are activated or deactivated, Pi rebuilds the entire system prompt to
 * include tool snippets and guidelines, so getContextUsage().tokens — which
 * counts all message tokens including the system prompt — already captures
 * them. Adding our own heuristic estimate on top would double-count.
 *
 * We still compute toolsTokens separately for display purposes only, so the
 * user can see a rough breakdown. Note: changing tools mid-session invalidates
 * prompt caching (Anthropic/OpenAI cache from the first message), since the
 * system prompt — the conversation prefix — is regenerated entirely.
 *
 * Other estimates (system prompt, AGENTS files, individual messages)
 * all use the same chars ÷ 4 heuristic, which deliberately overestimates
 * slightly (~4 chars per token is a common rough approximation for
 * English text; actual tokenizers vary by language, code, etc.).
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ToolResultEvent,
} from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import {
  Container,
  Key,
  Text,
  matchesKey,
  type Component,
  type TUI,
} from "@mariozechner/pi-tui";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

function formatUsd(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return "$0.00";
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  if (cost >= 0.1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(4)}`;
}

function estimateTokens(text: string): number {
  // Deliberately fuzzy (good enough for “how big-ish is this”).
  return Math.max(0, Math.ceil(text.length / 4));
}

function normalizeReadPath(inputPath: string, cwd: string): string {
  // Similar to pi's resolveToCwd/resolveReadPath, but simplified.
  let p = inputPath;
  if (p.startsWith("@")) p = p.slice(1);
  if (p === "~") p = os.homedir();
  else if (p.startsWith("~/")) p = path.join(os.homedir(), p.slice(2));
  if (!path.isAbsolute(p)) p = path.resolve(cwd, p);
  return path.resolve(p);
}

function getAgentDir(): string {
  // Mirrors pi's behavior reasonably well.
  const envCandidates = ["PI_CODING_AGENT_DIR", "TAU_CODING_AGENT_DIR"];
  let envDir: string | undefined;
  for (const k of envCandidates) {
    if (process.env[k]) {
      envDir = process.env[k];
      break;
    }
  }
  if (!envDir) {
    for (const [k, v] of Object.entries(process.env)) {
      if (k.endsWith("_CODING_AGENT_DIR") && v) {
        envDir = v;
        break;
      }
    }
  }

  if (envDir) {
    if (envDir === "~") return os.homedir();
    if (envDir.startsWith("~/"))
      return path.join(os.homedir(), envDir.slice(2));
    return envDir;
  }
  return path.join(os.homedir(), ".pi", "agent");
}

async function readFileIfExists(
  filePath: string,
): Promise<{ path: string; content: string; bytes: number } | null> {
  if (!existsSync(filePath)) return null;
  try {
    const buf = await fs.readFile(filePath);
    return {
      path: filePath,
      content: buf.toString("utf8"),
      bytes: buf.byteLength,
    };
  } catch {
    return null;
  }
}

async function loadProjectContextFiles(
  cwd: string,
): Promise<Array<{ path: string; tokens: number; bytes: number }>> {
  const out: Array<{ path: string; tokens: number; bytes: number }> = [];
  const seen = new Set<string>();

  const loadFromDir = async (dir: string) => {
    for (const name of ["AGENTS.md", "CLAUDE.md"]) {
      const p = path.join(dir, name);
      const f = await readFileIfExists(p);
      if (f && !seen.has(f.path)) {
        seen.add(f.path);
        out.push({
          path: f.path,
          tokens: estimateTokens(f.content),
          bytes: f.bytes,
        });
        // pi loads at most one of those per dir
        return;
      }
    }
  };

  await loadFromDir(getAgentDir());

  // Ancestors: root → cwd (same order as pi)
  const stack: string[] = [];
  let current = path.resolve(cwd);
  while (true) {
    stack.push(current);
    const parent = path.resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }
  stack.reverse();
  for (const dir of stack) await loadFromDir(dir);

  return out;
}

function normalizeSkillName(name: string): string {
  return name.startsWith("skill:") ? name.slice("skill:".length) : name;
}

type SkillIndexEntry = {
  name: string;
  skillFilePath: string;
  skillDir: string;
};

function buildSkillIndex(pi: ExtensionAPI, cwd: string): SkillIndexEntry[] {
  return pi
    .getCommands()
    .filter((c) => c.source === "skill")
    .map((c) => {
      const p = c.sourceInfo?.path
        ? normalizeReadPath(c.sourceInfo.path, cwd)
        : "";
      return {
        name: normalizeSkillName(c.name),
        skillFilePath: p,
        skillDir: p ? path.dirname(p) : "",
      };
    })
    .filter((x) => x.name && x.skillDir);
}

const SKILL_LOADED_ENTRY = "context:skill_loaded";

type SkillLoadedEntryData = {
  name: string;
  path: string;
};

function getLoadedSkillsFromSession(ctx: ExtensionContext): Set<string> {
  const out = new Set<string>();
  for (const e of ctx.sessionManager.getEntries()) {
    if (e.type !== "custom") continue;
    if (e.customType !== SKILL_LOADED_ENTRY) continue;
    const data = e.data as SkillLoadedEntryData | undefined;
    if (data?.name) out.add(data.name);
  }
  return out;
}

function extractCostTotal(usage: any): number {
  if (!usage) return 0;
  const c = usage?.cost;
  if (typeof c === "number") return Number.isFinite(c) ? c : 0;
  if (typeof c === "string") {
    const n = Number(c);
    return Number.isFinite(n) ? n : 0;
  }
  const t = c?.total;
  if (typeof t === "number") return Number.isFinite(t) ? t : 0;
  if (typeof t === "string") {
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function sumSessionUsage(ctx: ExtensionCommandContext): {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
} {
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let totalCost = 0;

  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type !== "message") continue;
    const msg = entry.message;
    if (!msg || msg.role !== "assistant") continue;
    const usage = msg.usage;
    if (!usage) continue;
    input += Number(usage.inputTokens ?? 0) || 0;
    output += Number(usage.outputTokens ?? 0) || 0;
    cacheRead += Number(usage.cacheRead ?? 0) || 0;
    cacheWrite += Number(usage.cacheWrite ?? 0) || 0;
    totalCost += extractCostTotal(usage);
  }

  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens: input + output + cacheRead + cacheWrite,
    totalCost,
  };
}

/**
 * Check whether the session has recorded usage from at least one
 * successful (non-aborted, non-error) assistant response.
 * Without such a response, getContextUsage().tokens is pure estimation
 * with no real API data anchor, so we should show "unknown" instead.
 */
function hasCompletedAssistantResponse(ctx: ExtensionCommandContext): boolean {
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type !== "message") continue;
    const msg = entry.message;
    if (!msg || msg.role !== "assistant") continue;
    if (msg.stopReason === "aborted" || msg.stopReason === "error") continue;
    if (msg.usage) return true;
  }
  return false;
}

function shortenPath(p: string, cwd: string): string {
  const rp = path.resolve(p);
  const rc = path.resolve(cwd);
  if (rp === rc) return ".";
  if (rp.startsWith(rc + path.sep)) return "./" + rp.slice(rc.length + 1);
  return rp;
}

function renderUsageBar(
  theme: any,
  used: number,
  total: number,
  width: number,
): string {
  const w = Math.max(10, width);
  if (total <= 0) return "";

  const toCols = (n: number) => Math.round((n / total) * w);
  let usedCols = toCols(used);
  let freeCols = w - usedCols;
  if (freeCols < 0) freeCols = 0;
  // adjust rounding drift
  while (usedCols + freeCols < w) freeCols++;
  while (usedCols + freeCols > w && freeCols > 0) freeCols--;

  const block = "█";
  const usedStr = theme.fg("accent", block.repeat(usedCols));
  const freeStr = theme.fg("dim", block.repeat(freeCols));
  return `${usedStr}${freeStr}`;
}

function joinComma(items: string[]): string {
  return items.join(", ");
}

function joinCommaStyled(
  items: string[],
  renderItem: (item: string) => string,
  sep: string,
): string {
  return items.map(renderItem).join(sep);
}

type WindowUsage = {
  messageTokens: number;
  contextWindow: number;
  percent: number;
  remainingTokens: number;
};

function getLastMessageUsage(ctx: ExtensionCommandContext): {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
} | null {
  for (let i = ctx.sessionManager.getEntries().length - 1; i >= 0; i--) {
    const entry = ctx.sessionManager.getEntries()[i];
    if (entry.type !== "message") continue;
    const msg = entry.message;
    if (!msg || msg.role !== "assistant") continue;
    if (!msg.usage) continue;
    const input = Number(msg.usage.input ?? 0) || 0;
    const output = Number(msg.usage.output ?? 0) || 0;
    const cacheRead = Number(msg.usage.cacheRead ?? 0) || 0;
    const cacheWrite = Number(msg.usage.cacheWrite ?? 0) || 0;
    return {
      input,
      output,
      cacheRead,
      cacheWrite,
      totalTokens: input + output + cacheRead + cacheWrite,
      cost: extractCostTotal(msg.usage),
    };
  }
  return null;
}

type ContextViewData = {
  // null = no model/context window info; object = known window usage; "unknown" = model exists but token count unavailable
  window: WindowUsage | null | "unknown";
  systemPromptTokens: number;
  agentTokens: number;
  toolsTokens: number;
  activeTools: number;
  activeToolNames: string[];
  agentFiles: string[];
  skills: string[];
  loadedSkills: string[];
  session: { totalTokens: number; totalCost: number };
  lastMessage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    cost: number;
  } | null;
};

class ContextView implements Component {
  private tui: TUI;
  private theme: any;
  private onDone: () => void;
  private data: ContextViewData;
  private container: Container;
  private body: Text;
  private cachedWidth?: number;

  constructor(tui: TUI, theme: any, data: ContextViewData, onDone: () => void) {
    this.tui = tui;
    this.theme = theme;
    this.data = data;
    this.onDone = onDone;

    this.container = new Container();
    this.container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
    this.container.addChild(
      new Text(
        theme.fg("accent", theme.bold("Context")) +
          theme.fg("dim", "  (Esc/q/Enter to close)"),
        1,
        0,
      ),
    );
    this.container.addChild(new Text("", 1, 0));

    this.body = new Text("", 1, 0);
    this.container.addChild(this.body);

    this.container.addChild(new Text("", 1, 0));
    this.container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
  }

  private rebuild(width: number): void {
    const muted = (s: string) => this.theme.fg("muted", s);
    const dim = (s: string) => this.theme.fg("dim", s);
    const text = (s: string) => this.theme.fg("text", s);

    const lines: string[] = [];

    // Window + bar
    if (this.data.window === null) {
      lines.push(muted("Window: ") + dim("(unknown)"));
    } else if (this.data.window === "unknown") {
      lines.push(
        muted("Window: ") + text("~unknown tokens") + muted(" · ") + dim("waiting for first LLM response"),
      );
    } else {
      const w = this.data.window;
      lines.push(
        muted("Window: ") +
          text(
            `~${w.messageTokens.toLocaleString()} / ${w.contextWindow.toLocaleString()}`,
          ) +
          muted(
            `  (${w.percent.toFixed(1)}% used, ~${w.remainingTokens.toLocaleString()} left)`,
          ),
      );

      // bar width tries to fit within the viewport
      const barWidth = Math.max(10, Math.min(36, width - 10));

      const barUsed = Math.round((w.percent / 100) * barWidth);
      const bar =
        renderUsageBar(
          this.theme,
          barUsed,
          barWidth,
          barWidth,
        ) +
        " " +
        dim("used") +
        this.theme.fg("accent", "█") +
        " " +
        dim("free") +
        this.theme.fg("dim", "█");
      lines.push(bar);
    }

    lines.push("");

    // System prompt + tools totals (approx) — always shown when model exists
    lines.push(
      muted("System: ") +
        text(`~${this.data.systemPromptTokens.toLocaleString()} tok`) +
        muted(` (AGENTS ~${this.data.agentTokens.toLocaleString()})`),
    );
    lines.push(
      muted("Tools: ") +
        text(`~${this.data.toolsTokens.toLocaleString()} tok`) +
        muted(` (${this.data.activeTools} active)`),
    );
    if (this.data.activeToolNames.length) {
      lines.push(
        muted("  ") +
          muted(joinComma(this.data.activeToolNames)),
      );
    }

    lines.push(
      muted(`AGENTS (${this.data.agentFiles.length}): `) +
        text(
          this.data.agentFiles.length
            ? joinComma(this.data.agentFiles)
            : "(none)",
        ),
    );
    lines.push("");

    const loaded = new Set(this.data.loadedSkills);
    const skillsRendered = this.data.skills.length
      ? joinCommaStyled(
          this.data.skills,
          (name) =>
            loaded.has(name)
              ? this.theme.fg("success", name)
              : this.theme.fg("muted", name),
          this.theme.fg("muted", ", "),
        )
      : "(none)";
    lines.push(muted(`Skills (${this.data.skills.length}): `) + skillsRendered);
    lines.push("");
    lines.push(
      muted("Session: ") +
        text(`${this.data.session.totalTokens.toLocaleString()} tokens`) +
        muted(" · ") +
        text(formatUsd(this.data.session.totalCost)),
    );
    if (this.data.lastMessage) {
      const lm = this.data.lastMessage;
      lines.push(
        muted("Last msg: ") +
          text(`${lm.totalTokens.toLocaleString()} tok`) +
          muted(" · ") +
          text(formatUsd(lm.cost)) +
          muted(" · ") +
          dim(`in ${lm.input.toLocaleString()} · out ${lm.output.toLocaleString()}`) +
          (lm.cacheRead > 0 || lm.cacheWrite > 0
            ? muted(" · ") + dim(`cache r ${lm.cacheRead.toLocaleString()} · w ${lm.cacheWrite.toLocaleString()}`)
            : ""),
      );
    }

    this.body.setText(lines.join("\n"));
    this.cachedWidth = width;
  }

  handleInput(data: string): void {
    if (
      matchesKey(data, Key.escape) ||
      matchesKey(data, Key.ctrl("c")) ||
      data.toLowerCase() === "q" ||
      data === "\r"
    ) {
      this.onDone();
      return;
    }
  }

  invalidate(): void {
    this.container.invalidate();
    this.cachedWidth = undefined;
  }

  render(width: number): string[] {
    if (this.cachedWidth !== width) this.rebuild(width);
    return this.container.render(width);
  }
}

export default function contextExtension(pi: ExtensionAPI) {
  // Track which skills were actually pulled in via read tool calls.
  let lastSessionId: string | null = null;
  let cachedLoadedSkills = new Set<string>();
  let cachedSkillIndex: SkillIndexEntry[] = [];

  const ensureCaches = (ctx: ExtensionContext) => {
    const sid = ctx.sessionManager.getSessionId();
    if (sid !== lastSessionId) {
      lastSessionId = sid;
      cachedLoadedSkills = getLoadedSkillsFromSession(ctx);
      cachedSkillIndex = buildSkillIndex(pi, ctx.cwd);
    }
    if (cachedSkillIndex.length === 0) {
      cachedSkillIndex = buildSkillIndex(pi, ctx.cwd);
    }
  };

  const matchSkillForPath = (absPath: string): string | null => {
    let best: SkillIndexEntry | null = null;
    for (const s of cachedSkillIndex) {
      if (!s.skillDir) continue;
      if (
        absPath === s.skillFilePath ||
        absPath.startsWith(s.skillDir + path.sep)
      ) {
        if (!best || s.skillDir.length > best.skillDir.length) best = s;
      }
    }
    return best?.name ?? null;
  };

  pi.on("tool_result", (event: ToolResultEvent, ctx: ExtensionContext) => {
    // Only count successful reads.
    if ((event as any).toolName !== "read") return;
    if ((event as any).isError) return;

    const input = (event as any).input as { path?: unknown } | undefined;
    const p = typeof input?.path === "string" ? input.path : "";
    if (!p) return;

    ensureCaches(ctx);
    const abs = normalizeReadPath(p, ctx.cwd);
    const skillName = matchSkillForPath(abs);
    if (!skillName) return;

    if (!cachedLoadedSkills.has(skillName)) {
      cachedLoadedSkills.add(skillName);
      pi.appendEntry<SkillLoadedEntryData>(SKILL_LOADED_ENTRY, {
        name: skillName,
        path: abs,
      });
    }
  });

  pi.registerCommand("context", {
    description: "Show loaded context overview",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      const commands = pi.getCommands();
      const skillCmds = commands.filter((c) => c.source === "skill");

      const skills = skillCmds
        .map((c) => normalizeSkillName(c.name))
        .sort((a, b) => a.localeCompare(b));

      const agentFiles = await loadProjectContextFiles(ctx.cwd);
      const agentFilePaths = agentFiles.map((f) =>
        shortenPath(f.path, ctx.cwd),
      );
      const agentTokens = agentFiles.reduce((a, f) => a + f.tokens, 0);

      const systemPrompt = ctx.getSystemPrompt();
      const systemPromptTokens = systemPrompt
        ? estimateTokens(systemPrompt)
        : 0;

      const usage = ctx.getContextUsage();
      const ctxWindow = usage?.contextWindow ?? 0;

      // Tool definitions are always computable regardless of context usage state.
      // We estimate them for display only — they are NOT added to effectiveTokens
      // because Pi injects tool descriptions into the system prompt, so
      // messageTokens already includes them. See header comment for details.
      const TOOL_FUDGE = 1.5;
      const activeToolNames = pi.getActiveTools();
      const toolInfoByName = new Map(
        pi.getAllTools().map((t) => [t.name, t] as const),
      );
      let toolsTokens = 0;
      for (const name of activeToolNames) {
        const info = toolInfoByName.get(name);
        const blob = `${name}\n${info?.description ?? ""}`;
        toolsTokens += estimateTokens(blob);
      }
      toolsTokens = Math.round(toolsTokens * TOOL_FUDGE);

      // Three states for context window usage:
      //   null      → no model / unknown context window (usage === undefined)
      //   "unknown" → model exists, context window known, but token count unavailable
      //              (post-compaction, fresh session, or no completed LLM response yet)
      //   object    → normal known usage with a real API-data anchor
      let window: WindowUsage | null | "unknown";
      if (!usage) {
        window = null;
      } else if (usage.tokens === null || !hasCompletedAssistantResponse(ctx)) {
        window = "unknown";
      } else {
        const messageTokens = usage.tokens; // tools already counted in system prompt
        const percent = ctxWindow > 0 ? (messageTokens / ctxWindow) * 100 : 0;
        const remainingTokens =
          ctxWindow > 0 ? Math.max(0, ctxWindow - messageTokens) : 0;

        window = {
          messageTokens,
          contextWindow: ctxWindow,
          percent,
          remainingTokens,
        };
      }

      const sessionUsage = sumSessionUsage(ctx);
      const lastMessageUsage = getLastMessageUsage(ctx);

      const makePlainText = () => {
        const lines: string[] = [];
        lines.push("Context");
        if (window === null) {
          lines.push("Window: (unknown)");
        } else if (window === "unknown") {
          lines.push(`Window: ~unknown / ${ctxWindow.toLocaleString()} (waiting for first LLM response)`);
        } else {
          lines.push(
            `Window: ~${window.messageTokens.toLocaleString()} / ${ctxWindow.toLocaleString()} (${window.percent.toFixed(1)}% used, ~${window.remainingTokens.toLocaleString()} left)`,
          );
        }
        lines.push(
          `System: ~${systemPromptTokens.toLocaleString()} tok (AGENTS ~${agentTokens.toLocaleString()})`,
        );
        lines.push(
          `Tools: ~${toolsTokens.toLocaleString()} tok (${activeToolNames.length} active)`,
        );
        if (activeToolNames.length) {
          lines.push(`  ${joinComma(activeToolNames)}`);
        }
        lines.push(
          `AGENTS: ${agentFilePaths.length ? joinComma(agentFilePaths) : "(none)"}`,
        );

        lines.push(
          `Skills (${skills.length}): ${skills.length ? joinComma(skills) : "(none)"}`,
        );
        lines.push(
          `Session: ${sessionUsage.totalTokens.toLocaleString()} tokens · ${formatUsd(sessionUsage.totalCost)}`,
        );
        if (lastMessageUsage) {
          lines.push(
            `Last msg: ${lastMessageUsage.totalTokens.toLocaleString()} tok · ${formatUsd(lastMessageUsage.cost)} · in ${lastMessageUsage.input.toLocaleString()} · out ${lastMessageUsage.output.toLocaleString()}${lastMessageUsage.cacheRead > 0 || lastMessageUsage.cacheWrite > 0 ? ` · cache r ${lastMessageUsage.cacheRead.toLocaleString()} · w ${lastMessageUsage.cacheWrite.toLocaleString()}` : ""}`,
          );
        }
        return lines.join("\n");
      };

      if (!ctx.hasUI) {
        pi.sendMessage(
          { customType: "context", content: makePlainText(), display: true },
          { triggerTurn: false },
        );
        return;
      }

      const loadedSkills = Array.from(getLoadedSkillsFromSession(ctx)).sort(
        (a, b) => a.localeCompare(b),
      );

      const viewData: ContextViewData = {
        window,
        systemPromptTokens,
        agentTokens,
        toolsTokens,
        activeTools: activeToolNames.length,
        activeToolNames,
        agentFiles: agentFilePaths,
        skills,
        loadedSkills,
        session: {
          totalTokens: sessionUsage.totalTokens,
          totalCost: sessionUsage.totalCost,
        },
        lastMessage: lastMessageUsage,
      };

      await ctx.ui.custom<void>((tui, theme, _kb, done) => {
        return new ContextView(tui, theme, viewData, done);
      });
    },
  });
}
