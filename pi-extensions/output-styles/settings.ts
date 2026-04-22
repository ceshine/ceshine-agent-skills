/**
 * Settings loader for output-style resolution.
 * Reads outputStyle from settings.json with standard Pi precedence:
 * 1. .pi/settings.json (project-level, highest priority)
 * 2. ~/.pi/agent/settings.json (global fallback)
 * 3. "default" (built-in fallback)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export function loadSettings(cwd: string): string {
  const projectPath = join(cwd, ".pi", "settings.json");
  const globalPath = join(homedir(), ".pi", "agent", "settings.json");

  // Try project-level settings first
  const projectStyle = readOutputStyle(projectPath);
  if (projectStyle !== undefined) {
    return projectStyle;
  }

  // Fall back to global settings
  const globalStyle = readOutputStyle(globalPath);
  if (globalStyle !== undefined) {
    return globalStyle;
  }

  // Built-in fallback
  return "default";
}

function readOutputStyle(settingsPath: string): string | undefined {
  if (!existsSync(settingsPath)) {
    return undefined;
  }

  try {
    const content = readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(content);
    if (typeof settings.outputStyle === "string" && settings.outputStyle) {
      return settings.outputStyle;
    }
  } catch {
    // Invalid settings file — ignore and fall through
  }

  return undefined;
}
