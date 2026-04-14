/**
 * Protected Paths Extension
 *
 * Supports two kinds of path protection:
 * 1. readOnlyPaths: allow reads, but block edit/write operations
 * 2. blockedPaths: block read/edit/write operations entirely
 *
 * Configurable via settings.json custom fields, e.g.:
 * {
 *   "readOnlyPaths": [".env", ".git/", "node_modules/"],
 *   "blockedPaths": ["secrets/", "private/"]
 * }
 *
 * Backward compatibility:
 * - protectedPaths is treated the same as readOnlyPaths
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

type PathProtectionSettings = {
  readOnlyPaths: string[];
  blockedPaths: string[];
};

const DEFAULT_PATHS: PathProtectionSettings = {
  readOnlyPaths: [".env", ".git/", "node_modules/"],
  blockedPaths: [],
};

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function loadFromSettingsFile(
  settingsPath: string,
): PathProtectionSettings | null {
  if (!existsSync(settingsPath)) {
    return null;
  }
  try {
    const content = readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(content);

    const readOnlyPaths = toStringArray(settings.readOnlyPaths);
    const blockedPaths = toStringArray(settings.blockedPaths);
    const legacyProtectedPaths = toStringArray(settings.protectedPaths);

    return {
      readOnlyPaths:
        readOnlyPaths.length > 0 ? readOnlyPaths : legacyProtectedPaths,
      blockedPaths,
    };
  } catch {
    // Settings file invalid - return null to use fallback
    return null;
  }
}

function loadProtectedPaths(cwd: string): PathProtectionSettings {
  // Two-layer config:
  // 1. Project-level: {cwd}/.pi/settings.json
  // 2. Global: ~/.pi/agent/settings.json (fallback)

  const projectSettingsPath = join(cwd, ".pi", "settings.json");
  const globalSettingsPath = join(homedir(), ".pi", "agent", "settings.json");

  // Try project-level settings first
  const projectSettings = loadFromSettingsFile(projectSettingsPath);

  if (projectSettings) {
    return projectSettings;
  }

  // Fall back to global settings
  const globalSettings = loadFromSettingsFile(globalSettingsPath);

  if (globalSettings) {
    return globalSettings;
  }

  // Use defaults if no config found
  return DEFAULT_PATHS;
}

export default function (pi: ExtensionAPI) {
  // Get current working directory from extension context
  const cwd = process.cwd();
  const { readOnlyPaths, blockedPaths } = loadProtectedPaths(cwd);

  pi.on("tool_call", async (event, ctx) => {
    if (
      event.toolName !== "read" &&
      event.toolName !== "write" &&
      event.toolName !== "edit"
    ) {
      return undefined;
    }

    const path = event.input.path as string;
    const isBlocked = blockedPaths.some((p) => path.includes(p));
    const isReadOnly = readOnlyPaths.some((p) => path.includes(p));

    if (isBlocked) {
      if (ctx.hasUI) {
        ctx.ui.notify(
          `Blocked ${event.toolName} on blocked path: ${path}`,
          "warning",
        );
      }
      return {
        block: true,
        reason: `Path "${path}" is blocked for all file operations`,
      };
    }

    if (
      isReadOnly &&
      (event.toolName === "write" || event.toolName === "edit")
    ) {
      if (ctx.hasUI) {
        ctx.ui.notify(
          `Blocked ${event.toolName} on read-only path: ${path}`,
          "warning",
        );
      }
      return { block: true, reason: `Path "${path}" is read-only` };
    }

    return undefined;
  });
}
