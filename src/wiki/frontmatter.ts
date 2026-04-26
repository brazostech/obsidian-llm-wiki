import { parseYaml, stringifyYaml } from "obsidian";

export function sanitizeYamlString(yaml: string): string {
  const lines = yaml.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    if (line.trim() === "" || line.match(/^#/) || line.match(/^-\s/)) {
      result.push(line);
      continue;
    }

    const match = line.match(/^(\s*)([^:]+):\s*(.*)$/);
    if (!match) {
      result.push(line);
      continue;
    }

    const [, indent, key, value] = match;
    let val = value;

    if (value.startsWith('"') || value.startsWith("'")) {
      result.push(line);
      continue;
    }

    const needsQuoting = val.includes(":") || val.includes("://") || val.includes("#") || val.includes("|") || val.includes(">");
    const canBeEmpty = val.trim() === "";

    if (needsQuoting && !canBeEmpty) {
      val = val.replace(/"/g, '\\"');
      result.push(`${indent}${key}: "${val}"`);
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

export function normalizeFrontmatter(content: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return content;

  try {
    const rawYaml = match[1];
    const sanitized = sanitizeYamlString(rawYaml);
    const frontmatter = parseYaml(sanitized) || {};
    const rebuilt = stringifyYaml(frontmatter);
    const body = content.slice(match[0].length);
    return `---\n${rebuilt}---\n${body}`;
  } catch (e) {
    return content;
  }
}

export function generateFrontmatter(data: Record<string, unknown>): string {
  return `---\n${stringifyYaml(data)}---\n`;
}

export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { frontmatter: {}, body: content };
  const rawYaml = match[1];
  const sanitized = sanitizeYamlString(rawYaml);
  const frontmatter = parseYaml(sanitized) || {};
  const body = content.slice(match[0].length);
  return { frontmatter, body };
}