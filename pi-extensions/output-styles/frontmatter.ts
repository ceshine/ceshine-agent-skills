/**
 * Simple YAML frontmatter parser.
 * Handles key: value pairs only. No nested objects, arrays, or multi-line values.
 */

export interface FrontmatterResult {
  frontmatter: Record<string, string>;
  body: string;
}

export function parseFrontmatter(content: string): FrontmatterResult {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return { frontmatter: {}, body: content };
  }

  const endIndex = trimmed.indexOf("---", 3);
  if (endIndex === -1) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterBlock = trimmed.slice(3, endIndex).trim();
  const body = trimmed.slice(endIndex + 3).trimStart();

  const frontmatter: Record<string, string> = {};
  for (const line of frontmatterBlock.split("\n")) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    const colonIndex = trimmedLine.indexOf(":");
    if (colonIndex === -1) continue;

    const key = trimmedLine.slice(0, colonIndex).trim();
    const value = trimmedLine.slice(colonIndex + 1).trim();
    if (key) {
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}
