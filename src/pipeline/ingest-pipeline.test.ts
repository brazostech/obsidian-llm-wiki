import { describe, it, expect, beforeEach, vi } from "vitest";
import { IngestPipeline } from "./ingest-pipeline";
import { createMockApp } from "../test/utils/mock-vault";
import { createStubProvider } from "../ai/ai-provider";
import { SessionManager } from "../sessions/manager";
import type { LlmWikiSettings, Proposal } from "../types";

const DEFAULT_SETTINGS: LlmWikiSettings = {
  zenApiKey: "test-key",
  model: "test-model",
  rawPath: "raw",
  wikiPath: "wiki",
  indexPath: "wiki/index.md",
  logPath: "wiki/log.md",
};

function makeApp(initial: Record<string, string> = {}) {
  return { vault: createMockApp(initial) } as any;
}

function collectEvents(pipeline: IngestPipeline) {
  const events: { type: string; data: any }[] = [];
  pipeline.on("phaseChange", (data) => events.push({ type: "phaseChange", data }));
  pipeline.on("message", (data) => events.push({ type: "message", data }));
  pipeline.on("proposal", (data) => events.push({ type: "proposal", data }));
  pipeline.on("error", (data) => events.push({ type: "error", data: data.message }));
  pipeline.on("loadingChange", (data) => events.push({ type: "loadingChange", data }));
  return events;
}

describe("IngestPipeline", () => {
  it("starts in SELECT phase", () => {
    const app = makeApp();
    const provider = createStubProvider();
    const pipeline = new IngestPipeline(app, DEFAULT_SETTINGS, provider);
    expect(pipeline.currentPhase).toBe("SELECT");
    expect(pipeline.currentMessages).toHaveLength(0);
  });

  it("selectSource on new file transitions to CHAT and emits greeting", async () => {
    const app = makeApp({ "raw/source.md": "# Source\n\nContent." });
    const provider = createStubProvider({ greet: "Welcome!" });
    const pipeline = new IngestPipeline(app, DEFAULT_SETTINGS, provider);
    const events = collectEvents(pipeline);

    await pipeline.selectSource("raw/source.md");

    expect(pipeline.currentPhase).toBe("CHAT");
    expect(pipeline.currentMessages).toHaveLength(1);
    expect(pipeline.currentMessages[0].role).toBe("assistant");
    expect(pipeline.currentMessages[0].content).toBe("Welcome!");
    expect(events.filter((e) => e.type === "phaseChange").map((e) => e.data)).toEqual(["CHAT"]);
  });

  it("selectSource falls back to default greeting on error", async () => {
    const app = makeApp({ "raw/source.md": "# Source\n\nContent." });
    const provider = createStubProvider();
    provider.greet = async () => {
      throw new Error("LLM error");
    };
    const pipeline = new IngestPipeline(app, DEFAULT_SETTINGS, provider);
    await pipeline.selectSource("raw/source.md");

    expect(pipeline.currentPhase).toBe("CHAT");
    expect(pipeline.currentMessages[0].content).toContain("I see you've selected");
  });

  it("selectSource resumes existing session", async () => {
    const app = makeApp({ "raw/source.md": "# Source\n\nContent." });
    const provider = createStubProvider();
    const pipeline = new IngestPipeline(app, DEFAULT_SETTINGS, provider);

    // Pre-seed a session
    const sessionManager = new SessionManager(app);
    await sessionManager.save({
      sourcePath: "raw/source.md",
      sourceContent: "# Source\n\nContent.",
      phase: "CHAT",
      messages: [
        { role: "assistant", content: "Hello" },
        { role: "user", content: "Hi" },
      ],
      proposal: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const events = collectEvents(pipeline);
    await pipeline.selectSource("raw/source.md");

    expect(pipeline.currentPhase).toBe("CHAT");
    expect(pipeline.currentMessages).toHaveLength(2);
    expect(pipeline.currentMessages[0].content).toBe("Hello");
    expect(pipeline.currentMessages[1].content).toBe("Hi");
    expect(events.some((e) => e.type === "phaseChange" && e.data === "CHAT")).toBe(true);
  });

  it("selectSource on DONE session resets to CHAT and injects resume message", async () => {
    const app = makeApp({ "raw/source.md": "# Source\n\nContent." });
    const provider = createStubProvider();
    const pipeline = new IngestPipeline(app, DEFAULT_SETTINGS, provider);

    const sessionManager = new SessionManager(app);
    await sessionManager.save({
      sourcePath: "raw/source.md",
      sourceContent: "# Source\n\nContent.",
      phase: "DONE",
      messages: [{ role: "assistant", content: "Done!" }],
      proposal: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await pipeline.selectSource("raw/source.md");

    expect(pipeline.currentPhase).toBe("CHAT");
    expect(pipeline.currentMessages.length).toBeGreaterThanOrEqual(1);
    expect(pipeline.currentMessages[pipeline.currentMessages.length - 1].content).toContain("You've previously ingested");
  });

  it("sendMessage appends user and assistant messages", async () => {
    const app = makeApp({ "raw/source.md": "# Source\n\nContent." });
    const provider = createStubProvider({ chat: "Response!" });
    const pipeline = new IngestPipeline(app, DEFAULT_SETTINGS, provider);
    await pipeline.selectSource("raw/source.md");

    await pipeline.sendMessage("My question");

    expect(pipeline.currentMessages).toHaveLength(3);
    expect(pipeline.currentMessages[1].role).toBe("user");
    expect(pipeline.currentMessages[1].content).toBe("My question");
    expect(pipeline.currentMessages[2].role).toBe("assistant");
    expect(pipeline.currentMessages[2].content).toBe("Response!");
  });

  it("commitAndPropose emits proposal and transitions to PROPOSE", async () => {
    const app = makeApp({ "raw/source.md": "# Source\n\nContent." });
    const proposalJson: Proposal = {
      sourceSummary: { slug: "source", title: "Source", tags: [] },
      actions: [
        { type: "CREATE", path: "wiki/source.md", description: "Create source page", content: "# Source" },
      ],
      indexUpdates: [{ section: "Sources", entry: "- [[source]] — Source" }],
      logEntry: "Created [[source]]",
    };
    const provider = createStubProvider({ propose: JSON.stringify(proposalJson) });
    const pipeline = new IngestPipeline(app, DEFAULT_SETTINGS, provider);
    await pipeline.selectSource("raw/source.md");
    await pipeline.sendMessage("Let's create it");

    const events = collectEvents(pipeline);
    await pipeline.commitAndPropose();

    expect(pipeline.currentPhase).toBe("PROPOSE");
    expect(pipeline.currentProposal).not.toBeNull();
    expect(pipeline.currentProposal!.actions).toHaveLength(1);
    expect(events.some((e) => e.type === "proposal")).toBe(true);
    expect(events.some((e) => e.type === "phaseChange" && e.data === "PROPOSE")).toBe(true);
  });

  it("applyProposal writes files and transitions to DONE", async () => {
    const app = makeApp({ "raw/source.md": "# Source\n\nContent." });
    const proposalJson: Proposal = {
      sourceSummary: { slug: "source", title: "Source", tags: [] },
      actions: [
        { type: "CREATE", path: "wiki/source.md", description: "Create source page", content: "# Source\n\nContent." },
      ],
      indexUpdates: [],
      logEntry: "Created [[source]]",
    };
    const provider = createStubProvider({
      greet: "Hi",
      propose: JSON.stringify(proposalJson),
    });
    const pipeline = new IngestPipeline(app, DEFAULT_SETTINGS, provider);
    await pipeline.selectSource("raw/source.md");
    await pipeline.commitAndPropose();

    await pipeline.applyProposal(pipeline.currentProposal!.actions);

    expect(pipeline.currentPhase).toBe("DONE");
    const file = app.vault.getAbstractFileByPath("wiki/source.md");
    expect(file).not.toBeNull();
  });

  it("reset returns to SELECT and clears state", async () => {
    const app = makeApp({ "raw/source.md": "# Source\n\nContent." });
    const provider = createStubProvider({ greet: "Hi" });
    const pipeline = new IngestPipeline(app, DEFAULT_SETTINGS, provider);
    await pipeline.selectSource("raw/source.md");
    expect(pipeline.currentPhase).toBe("CHAT");

    const events = collectEvents(pipeline);
    pipeline.reset();

    expect(pipeline.currentPhase).toBe("SELECT");
    expect(pipeline.currentMessages).toHaveLength(0);
    expect(pipeline.currentSourcePath).toBeNull();
    expect(events.some((e) => e.type === "phaseChange" && e.data === "SELECT")).toBe(true);
  });

  it("backToChat transitions to CHAT from PROPOSE", async () => {
    const app = makeApp({ "raw/source.md": "# Source\n\nContent." });
    const provider = createStubProvider({ greet: "Hi" });
    const pipeline = new IngestPipeline(app, DEFAULT_SETTINGS, provider);
    await pipeline.selectSource("raw/source.md");
    pipeline.backToChat();
    expect(pipeline.currentPhase).toBe("CHAT");
  });

  it("applyProposal with no proposal emits error", async () => {
    const app = makeApp();
    const provider = createStubProvider();
    const pipeline = new IngestPipeline(app, DEFAULT_SETTINGS, provider);

    await expect(pipeline.applyProposal([])).rejects.toThrow("No proposal to apply");
  });

  it("saves session after selectSource and message", async () => {
    const app = makeApp({ "raw/source.md": "# Source\n\nContent." });
    const provider = createStubProvider({ greet: "Hello" });
    const pipeline = new IngestPipeline(app, DEFAULT_SETTINGS, provider);
    await pipeline.selectSource("raw/source.md");

    const sessionManager = new SessionManager(app);
    let session = await sessionManager.load("raw/source.md");
    expect(session).not.toBeNull();
    expect(session!.phase).toBe("CHAT");
    expect(session!.messages).toHaveLength(1);

    await pipeline.sendMessage("test");
    session = await sessionManager.load("raw/source.md");
    expect(session!.messages).toHaveLength(3);
  });
});
