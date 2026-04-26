import { describe, it, expect } from "vitest";
import { createMockApp } from "../test/utils/mock-vault";
import { WikiWriter } from "./writer";
import type { Proposal } from "../ai/propose";

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    sourceSummary: { slug: "test", title: "Test", tags: [] },
    actions: [],
    indexUpdates: [],
    logEntry: "Test log entry",
    ...overrides,
  } as Proposal;
}

describe("WikiWriter.applyProposal", () => {
  it("creates files for CREATE actions", async () => {
    const app = { vault: createMockApp({}) } as any;
    const writer = new WikiWriter(app);

    const proposal = makeProposal({
      actions: [
        {
          type: "CREATE",
          path: "wiki/new-page.md",
          description: "Create a new page",
          content: "# New Page\n\nContent here.",
        },
      ],
    });

    await writer.applyProposal(proposal, "wiki/index.md", "wiki/log.md");

    const file = app.vault.getAbstractFileByPath("wiki/new-page.md");
    expect(file).not.toBeNull();
    const content = await app.vault.read(file as any);
    expect(content).toContain("# New Page");
  });

  it("modifies files for UPDATE actions", async () => {
    const app = { vault: createMockApp({
      "wiki/existing.md": "# Old\n\nOld content.",
    }) } as any;
    const writer = new WikiWriter(app);

    const proposal = makeProposal({
      actions: [
        {
          type: "UPDATE",
          path: "wiki/existing.md",
          description: "Update existing page",
          content: "# Updated\n\nNew content.",
        },
      ],
    });

    await writer.applyProposal(proposal, "wiki/index.md", "wiki/log.md");

    const file = app.vault.getAbstractFileByPath("wiki/existing.md");
    const content = await app.vault.read(file as any);
    expect(content).toContain("# Updated");
  });

  it("updates index with new entries after section headers", async () => {
    const app = { vault: createMockApp({
      "wiki/index.md": "# Index\n\n## Sources\n\n## Topics\n",
    }) } as any;
    const writer = new WikiWriter(app);

    const proposal = makeProposal({
      indexUpdates: [
        { section: "Sources", entry: "- [[sources/test]] — Test" },
      ],
    });

    await writer.applyProposal(proposal, "wiki/index.md", "wiki/log.md");

    const file = app.vault.getAbstractFileByPath("wiki/index.md");
    const content = await app.vault.read(file as any);
    expect(content).toContain("- [[sources/test]] — Test");
  });

  it("creates index if it does not exist and indexUpdates are provided", async () => {
    const app = { vault: createMockApp({}) } as any;
    const writer = new WikiWriter(app);

    const proposal = makeProposal({
      indexUpdates: [
        { section: "Sources", entry: "- [[sources/test]] — Test" },
      ],
    });

    await writer.applyProposal(proposal, "wiki/index.md", "wiki/log.md");

    const file = app.vault.getAbstractFileByPath("wiki/index.md");
    expect(file).toBeNull();
  });

  it("appends log entry with correct format", async () => {
    const app = { vault: createMockApp({}) } as any;
    const writer = new WikiWriter(app);

    const proposal = makeProposal({
      sourceSummary: { slug: "my-source", title: "My Source", tags: [] },
      logEntry: "Created [[sources/my-source]]",
    });

    await writer.applyProposal(proposal, "wiki/index.md", "wiki/log.md");

    const file = app.vault.getAbstractFileByPath("wiki/log.md");
    expect(file).not.toBeNull();
    const content = await app.vault.read(file as any);
    expect(content).toContain("ingest | my-source");
    expect(content).toContain("Created [[sources/my-source]]");
  });

  it("handles empty actions list", async () => {
    const app = { vault: createMockApp({}) } as any;
    const writer = new WikiWriter(app);

    const proposal = makeProposal({
      actions: [],
    });

    await writer.applyProposal(proposal, "wiki/index.md", "wiki/log.md");

    expect(app.vault.getFiles()).toHaveLength(1); // only log file
  });

  it("does not fail when index section header is missing", async () => {
    const app = { vault: createMockApp({
      "wiki/index.md": "# Index\n\nNo sections here.\n",
    }) } as any;
    const writer = new WikiWriter(app);

    const proposal = makeProposal({
      indexUpdates: [
        { section: "Missing", entry: "- [[item]] — desc" },
      ],
    });

    await expect(
      writer.applyProposal(proposal, "wiki/index.md", "wiki/log.md")
    ).resolves.not.toThrow();
  });

  it("normalizes frontmatter in action content before writing", async () => {
    const app = { vault: createMockApp({}) } as any;
    const writer = new WikiWriter(app);

    const proposal = makeProposal({
      actions: [
        {
          type: "CREATE",
          path: "wiki/page.md",
          description: "Create page",
          content: `---\ntitle: GitHub - PowerShell/PowerShell: PowerShell for every system!\n---\n\n# Page\n`,
        },
      ],
    });

    await writer.applyProposal(proposal, "wiki/index.md", "wiki/log.md");

    const file = app.vault.getAbstractFileByPath("wiki/page.md");
    const content = await app.vault.read(file as any);
    expect(content).toContain('title: "GitHub - PowerShell/PowerShell: PowerShell for every system!"');
  });
});
