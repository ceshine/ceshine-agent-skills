/**
 * Built-in styles and style resolution.
 * Built-in styles (except default) are loaded from .md files in the builtins/ directory.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.js";

export interface StyleDefinition {
  name: string;
  description: string;
  instructions: string;
}

function loadBuiltInStyles(): Record<string, StyleDefinition> {
  const styles: Record<string, StyleDefinition> = {
    default: {
      name: "default",
      description: "No style override",
      instructions: "",
    },
  };

  const builtinsDir = join(import.meta.dirname, "builtins");

  let files: string[];
  try {
    files = readdirSync(builtinsDir);
  } catch {
    return styles;
  }

  for (const file of files) {
    if (!file.endsWith(".md")) continue;

    let content: string;
    try {
      content = readFileSync(join(builtinsDir, file), "utf-8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseFrontmatter(content);
    const name = frontmatter.name?.trim();

    if (!name) {
      console.warn(`[output-styles] Built-in style ${file} missing 'name' in frontmatter`);
      continue;
    }

    const instructions = body.trim();
    if (!instructions) {
      console.warn(`[output-styles] Built-in style ${file} has an empty instruction body; skipping`);
      continue;
    }

    styles[name] = {
      name,
      description: frontmatter.description?.trim() || "Built-in style",
      instructions,
    };
  }

  return styles;
}

export const BUILT_IN_STYLES: Record<string, StyleDefinition> = loadBuiltInStyles();

export function getStyleInstructions(
  name: string,
  customStyles: Map<string, StyleDefinition>,
): string | undefined {
  // Custom styles shadow built-ins
  const custom = customStyles.get(name);
  if (custom) {
    return custom.instructions;
  }

  const builtIn = BUILT_IN_STYLES[name];
  if (builtIn) {
    return builtIn.instructions;
  }

  return undefined;
}

export function getStyleDescription(
  name: string,
  customStyles: Map<string, StyleDefinition>,
): string | undefined {
  const custom = customStyles.get(name);
  if (custom) {
    return custom.description;
  }

  const builtIn = BUILT_IN_STYLES[name];
  if (builtIn) {
    return builtIn.description;
  }

  return undefined;
}

export function isValidStyle(
  name: string,
  customStyles: Map<string, StyleDefinition>,
): boolean {
  return customStyles.has(name) || name in BUILT_IN_STYLES;
}

export function getAllStyleNames(
  customStyles: Map<string, StyleDefinition>,
): string[] {
  const names = new Set<string>([...Object.keys(BUILT_IN_STYLES), ...customStyles.keys()]);
  return Array.from(names).sort();
}
