import { parseYaml, stringifyYaml } from "obsidian";

export function generateFrontmatter(data: Record<string, unknown>): string {
  return `---\n${stringifyYaml(data)}---\n`;
}

export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { frontmatter: {}, body: content };
  const frontmatter = parseYaml(match[1]) || {};
  const body = content.slice(match[0].length);
  return { frontmatter, body };
}
