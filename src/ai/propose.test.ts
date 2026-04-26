import { describe, it, expect } from "vitest";
import { generateProposal, ProposalSchema } from "./propose";
import { createStubProvider } from "./ai-provider";

function validProposalJson(): string {
  return JSON.stringify({
    sourceSummary: {
      slug: "test-source",
      title: "Test Source",
      tags: ["test"],
    },
    actions: [
      {
        type: "CREATE",
        path: "wiki/sources/test-source.md",
        description: "Create test source page",
        content: "# Test Source\n\nSome content.",
      },
    ],
    indexUpdates: [
      {
        section: "Sources",
        entry: "- [[sources/test-source]] — Test Source",
      },
    ],
    logEntry: "Created [[sources/test-source]]",
  });
}

describe("generateProposal", () => {
  it("parses valid JSON from stub provider", async () => {
    const provider = createStubProvider({
      propose: validProposalJson(),
    });

    const result = await generateProposal(provider, [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ]);

    expect(result.sourceSummary.slug).toBe("test-source");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe("CREATE");
    expect(result.indexUpdates).toHaveLength(1);
    expect(result.logEntry).toBe("Created [[sources/test-source]]");
  });

  it("strips markdown code fences if present", async () => {
    const fenced = "```json\n" + validProposalJson() + "\n```";
    const provider = createStubProvider({
      propose: fenced,
    });

    const result = await generateProposal(provider, [
      { role: "user", content: "Hello" },
    ]);

    expect(result.sourceSummary.title).toBe("Test Source");
  });

  it("throws when JSON is invalid", async () => {
    const provider = createStubProvider({
      propose: "this is not json",
    });

    await expect(
      generateProposal(provider, [{ role: "user", content: "Hello" }])
    ).rejects.toThrow("could not be parsed as JSON");
  });

  it("throws when Zod validation fails", async () => {
    const badJson = JSON.stringify({
      sourceSummary: { slug: "test", title: "Test", tags: ["test"] },
      actions: [{ type: "INVALID", path: "x", description: "x", content: "x" }],
      indexUpdates: [],
      logEntry: "x",
    });

    const provider = createStubProvider({
      propose: badJson,
    });

    await expect(
      generateProposal(provider, [{ role: "user", content: "Hello" }])
    ).rejects.toThrow("didn't match the expected structure");
  });

  it("returns empty proposal when stub returns minimal valid JSON", async () => {
    const minimal = JSON.stringify({
      sourceSummary: { slug: "empty", title: "Empty", tags: [] },
      actions: [],
      indexUpdates: [],
      logEntry: "No actions needed",
    });

    const provider = createStubProvider({
      propose: minimal,
    });

    const result = await generateProposal(provider, []);
    expect(result.actions).toHaveLength(0);
    expect(result.indexUpdates).toHaveLength(0);
  });
});

describe("ProposalSchema", () => {
  it("validates a correct proposal", () => {
    const data = {
      sourceSummary: { slug: "a", title: "A", tags: ["t"] },
      actions: [
        { type: "UPDATE", path: "wiki/a.md", description: "d", content: "c" },
      ],
      indexUpdates: [{ section: "S", entry: "e" }],
      logEntry: "log",
    };
    const result = ProposalSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("rejects a missing field", () => {
    const data = {
      sourceSummary: { slug: "a", title: "A", tags: ["t"] },
      actions: [],
      indexUpdates: [],
    };
    const result = ProposalSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
