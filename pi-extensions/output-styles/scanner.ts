/**
 * Discover and parse .pi/output-styles/*.md files.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.js";
import type { StyleDefinition } from "./styles.js";

export interface ScanResult {
  styles: Map<string, StyleDefinition>;
  warnings: string[];
}

export function scanCustomStyles(cwd: string): ScanResult {
  const styles = new Map<string, StyleDefinition>();
  const warnings: string[] = [];
  const stylesDir = join(cwd, ".pi", "output-styles");

  if (!existsSync(stylesDir)) {
    return { styles, warnings };
  }

  let files: string[];
  try {
    files = readdirSync(stylesDir);
  } catch {
    return { styles, warnings };
  }

  for (const file of files) {
    if (!file.endsWith(".md")) continue;

    const filePath = join(stylesDir, file);
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseFrontmatter(content);
    const name = frontmatter.name?.trim();

    if (!name) {
      console.warn(`[output-styles] Skipping ${file}: missing 'name' in frontmatter`);
      continue;
    }

    const instructions = body.trim();
    if (!instructions) {
      warnings.push(`Skipping ${file}: empty instruction body`);
      continue;
    }

    styles.set(name, {
      name,
      description: frontmatter.description?.trim() || "Custom style",
      instructions,
    });
  }

  return { styles, warnings };
}
