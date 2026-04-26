import { describe, it, expect } from "vitest";
import { sanitizeYamlString, normalizeFrontmatter, parseFrontmatter } from "./frontmatter";

describe("sanitizeYamlString", () => {
  it("quotes bare values containing colons", () => {
    const input = `title: GitHub - PowerShell/PowerShell: PowerShell for every system!`;
    const result = sanitizeYamlString(input);
    expect(result).toBe(`title: "GitHub - PowerShell/PowerShell: PowerShell for every system!"`);
  });

  it("quotes bare values containing URLs", () => {
    const input = `url: https://example.com/path`;
    const result = sanitizeYamlString(input);
    expect(result).toBe(`url: "https://example.com/path"`);
  });

  it("leaves already double-quoted values unchanged", () => {
    const input = `title: "Already quoted"`;
    const result = sanitizeYamlString(input);
    expect(result).toBe(`title: "Already quoted"`);
  });

  it("leaves already single-quoted values unchanged", () => {
    const input = `title: 'Already quoted'`;
    const result = sanitizeYamlString(input);
    expect(result).toBe(`title: 'Already quoted'`);
  });

  it("leaves safe values without special characters unchanged", () => {
    const input = `author: Jane Doe\ndate: 2024-01-01`;
    const result = sanitizeYamlString(input);
    expect(result).toBe(input);
  });

  it("handles mixed safe and unsafe values", () => {
    const input = `title: A: Problematic\nauthor: Safe Person\nurl: http://example.com`;
    const result = sanitizeYamlString(input);
    expect(result).toBe(`title: "A: Problematic"\nauthor: Safe Person\nurl: "http://example.com"`);
  });

  it("does not quote bare values with internal double quotes (safe for YAML parser)", () => {
    const input = `title: She said "hello" to me`;
    const result = sanitizeYamlString(input);
    expect(result).toBe(input);
  });

  it("leaves comments unchanged", () => {
    const input = `# This is a comment\ntitle: Safe`;
    const result = sanitizeYamlString(input);
    expect(result).toBe(input);
  });

  it("leaves list items unchanged", () => {
    const input = `tags:\n  - first\n  - second`;
    const result = sanitizeYamlString(input);
    expect(result).toBe(input);
  });

  it("does not quote empty values", () => {
    const input = `description: `;
    const result = sanitizeYamlString(input);
    expect(result).toBe(`description: `);
  });

  it("handles values with hash characters", () => {
    const input = `title: Issue #123`;
    const result = sanitizeYamlString(input);
    expect(result).toBe(`title: "Issue #123"`);
  });

  it("handles values with pipe characters", () => {
    const input = `note: A | B`;
    const result = sanitizeYamlString(input);
    expect(result).toBe(`note: "A | B"`);
  });

  it("preserves indentation", () => {
    const input = `  nested: value: with colon`;
    const result = sanitizeYamlString(input);
    expect(result).toBe(`  nested: "value: with colon"`);
  });
});

describe("normalizeFrontmatter", () => {
  it("normalizes malformed frontmatter with bare colons", () => {
    const content = `---\ntitle: GitHub - PowerShell/PowerShell: PowerShell for every system!\n---\n\n# Body\n`;
    const result = normalizeFrontmatter(content);
    expect(result).toContain(`title: "GitHub - PowerShell/PowerShell: PowerShell for every system!"`);
    expect(result).toContain("# Body");
  });

  it("is idempotent on already-valid frontmatter", () => {
    const content = `---\ntitle: "Already Valid"\n---\n\nBody text.\n`;
    const result = normalizeFrontmatter(content);
    // Running again should produce the same output
    const second = normalizeFrontmatter(result);
    expect(second).toBe(result);
  });

  it("returns content unchanged when no frontmatter exists", () => {
    const content = `# Just a heading\n\nSome body text.`;
    const result = normalizeFrontmatter(content);
    expect(result).toBe(content);
  });

  it("handles frontmatter with only safe values", () => {
    const content = `---\nauthor: Jane\ndate: 2024-01-01\n---\n\nBody.\n`;
    const result = normalizeFrontmatter(content);
    expect(result).toContain("author: Jane");
    expect(result).toContain("Body.");
  });

  it("normalizes frontmatter with multiple bare-colon values", () => {
    const content = `---\ntitle: A: B\ndescription: https://example.com\n---\n\nBody.\n`;
    const result = normalizeFrontmatter(content);
    expect(result).toContain('title: "A: B"');
    expect(result).toContain('description: "https://example.com"');
    expect(result).toContain("Body.");
  });

  it("rebuilds frontmatter without trailing newline issues", () => {
    const content = `---\ntitle: Test\n---\nBody.`;
    const result = normalizeFrontmatter(content);
    expect(result).toMatch(/^---\n/);
    expect(result).toContain("Body.");
  });
});

describe("parseFrontmatter", () => {
  it("parses frontmatter with bare-colon titles via sanitizer", () => {
    const content = `---\ntitle: GitHub - PowerShell/PowerShell: PowerShell for every system!\n---\n\n# Heading\n`;
    const result = parseFrontmatter(content);
    expect(result.frontmatter.title).toBe("GitHub - PowerShell/PowerShell: PowerShell for every system!");
  });

  it("returns empty frontmatter and full body when no frontmatter block exists", () => {
    const content = `# Heading\n\nBody text.`;
    const result = parseFrontmatter(content);
    expect(Object.keys(result.frontmatter)).toHaveLength(0);
    expect(result.body).toBe(content);
  });

  it("separates frontmatter from body correctly", () => {
    const content = `---\nauthor: Jane\n---\n\n# Heading\n\nParagraph.\n`;
    const result = parseFrontmatter(content);
    expect(result.frontmatter.author).toBe("Jane");
    expect(result.body).toBe("\n# Heading\n\nParagraph.\n");
  });

  it("handles empty frontmatter block", () => {
    const content = `---\n\n---\n\nBody.`;
    const result = parseFrontmatter(content);
    expect(Object.keys(result.frontmatter)).toHaveLength(0);
    expect(result.body).toBe("\nBody.");
  });

  it("handles frontmatter with multiple fields", () => {
    const content = `---\ntitle: My Page\nauthor: John\ntags:\n  - foo\n  - bar\n---\n\nContent.`;
    const result = parseFrontmatter(content);
    expect(result.frontmatter.title).toBe("My Page");
    expect(result.frontmatter.author).toBe("John");
  });
});
