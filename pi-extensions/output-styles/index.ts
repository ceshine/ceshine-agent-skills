/**
 * Output Styles Extension
 *
 * Makes the agent's output style configurable via built-in styles,
 * project-local custom styles in .pi/output-styles/*.md, and the
 * /output-style command for interactive control.
 */

import {
  DynamicBorder,
  type ExtensionAPI,
  type ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import {
  Container,
  SelectList,
  type SelectItem,
  Text,
} from "@mariozechner/pi-tui";
import { loadSettings } from "./settings.js";
import { scanCustomStyles } from "./scanner.js";
import {
  BUILT_IN_STYLES,
  getStyleInstructions,
  getStyleDescription,
  isValidStyle,
  getAllStyleNames,
  type StyleDefinition,
} from "./styles.js";

export default function outputStylesExtension(pi: ExtensionAPI) {
  // Session state
  let sessionStyle: string = "default";
  let injectedStyle: string | undefined = undefined;
  let customStyles: Map<string, StyleDefinition> = new Map();

  // ───────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────

  function resolveSessionStyle(
    cwd: string,
    entries: Array<{ type: string; customType?: string; data?: unknown }>,
    ctx: ExtensionContext,
  ): string {
    // Restore from latest persisted session entry
    const styleEntries = entries.filter(
      (e) => e.type === "custom" && e.customType === "output-style",
    ) as Array<{ data?: { style?: string } }>;

    const latestEntry = styleEntries[styleEntries.length - 1];
    const persistedStyle = latestEntry?.data?.style;
    if (persistedStyle) {
      if (isValidStyle(persistedStyle, customStyles)) {
        return persistedStyle;
      }
      ctx.ui.notify(
        `Persisted output style '${persistedStyle}' no longer exists. Falling back to default.`,
        "warn",
      );
    }

    // Fall back to settings.json
    const fromSettings = loadSettings(cwd);
    if (isValidStyle(fromSettings, customStyles)) {
      return fromSettings;
    }
    ctx.ui.notify(
      `Configured output style '${fromSettings}' does not exist. Falling back to default.`,
      "warn",
    );
    return "default";
  }

  function buildStyleSelectorItems(
    currentStyle: string,
  ): SelectItem[] {
    const names = getAllStyleNames(customStyles);
    return names.map((name) => {
      const desc = getStyleDescription(name, customStyles);
      const isCurrent = name === currentStyle;
      return {
        value: name,
        label: isCurrent ? `${name} (current)` : name,
        description: desc,
      };
    });
  }

  function notifyStyleSet(name: string, ctx: ExtensionContext) {
    ctx.ui.notify(
      `Output style set to '${name}'. Takes effect on the next message.`,
      "info",
    );
  }

  // ───────────────────────────────────────────────
  // Commands
  // ───────────────────────────────────────────────

  pi.registerCommand("output-style", {
    description: "Set or view the output style",
    handler: async (args, ctx) => {
      const name = args?.trim();

      if (!name) {
        // Show selector
        const items = buildStyleSelectorItems(sessionStyle);
        const selectedName = await ctx.ui.custom<string | null>(
          (tui, theme, _kb, done) => {
            const container = new Container();

            container.addChild(
              new DynamicBorder((s: string) => theme.fg("accent", s)),
            );
            container.addChild(
              new Text(
                theme.fg("accent", theme.bold("Select output style:")),
                1,
                0,
              ),
            );

            const selectList = new SelectList(
              items,
              Math.min(items.length, 10),
              {
                selectedPrefix: (t) => theme.fg("accent", t),
                selectedText: (t) => theme.fg("accent", t),
                description: (t) => theme.fg("muted", t),
                scrollInfo: (t) => theme.fg("dim", t),
                noMatch: (t) => theme.fg("warning", t),
              },
            );
            selectList.onSelect = (item) => done(item.value);
            selectList.onCancel = () => done(null);
            container.addChild(selectList);

            container.addChild(
              new Text(
                theme.fg("dim", "↑↓ navigate • enter select • esc cancel"),
                1,
                0,
              ),
            );
            container.addChild(
              new DynamicBorder((s: string) => theme.fg("accent", s)),
            );

            return {
              render: (w) => container.render(w),
              invalidate: () => container.invalidate(),
              handleInput: (data) => {
                selectList.handleInput(data);
                tui.requestRender();
              },
            };
          },
        );

        if (!selectedName || selectedName === sessionStyle) return;

        sessionStyle = selectedName;
        pi.appendEntry("output-style", { style: selectedName });
        notifyStyleSet(selectedName, ctx);
        return;
      }

      // Direct set
      if (!isValidStyle(name, customStyles)) {
        const available = getAllStyleNames(customStyles).join(", ");
        ctx.ui.notify(
          `Unknown style '${name}'. Available: ${available}`,
          "error",
        );
        return;
      }

      if (name === sessionStyle) {
        return;
      }

      sessionStyle = name;
      pi.appendEntry("output-style", { style: name });
      notifyStyleSet(name, ctx);
    },
  });

  // ───────────────────────────────────────────────
  // Events
  // ───────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    // Scan custom styles
    const { styles: scannedStyles, warnings } = scanCustomStyles(ctx.cwd);
    customStyles = scannedStyles;
    for (const warning of warnings) {
      ctx.ui.notify(`[output-styles] ${warning}`, "warn");
    }

    // Resolve session style from persisted entries or settings
    const entries = ctx.sessionManager.getEntries();
    sessionStyle = resolveSessionStyle(ctx.cwd, entries, ctx);

    // Reset injection tracking
    injectedStyle = undefined;
  });

  pi.on("before_agent_start", async (_event, _ctx) => {
    if (sessionStyle === "default") {
      return undefined;
    }

    const instructions = getStyleInstructions(sessionStyle, customStyles);
    if (!instructions) {
      return undefined;
    }

    if (sessionStyle !== injectedStyle) {
      // Full instruction message on style change or first injection
      injectedStyle = sessionStyle;
      return {
        message: {
          customType: "output-style-msg",
          content: `Use the '${sessionStyle}' output style.\n\n${instructions}`,
          display: false,
        },
      };
    }

    // Short reminder on unchanged style
    return {
      message: {
        customType: "output-style-msg",
        content: `Reminder: continue using the '${sessionStyle}' output style.`,
        display: false,
      },
    };
  });

  pi.on("session_compact", async () => {
    // Reset so the current style is re-injected after compaction
    injectedStyle = undefined;
  });
}
