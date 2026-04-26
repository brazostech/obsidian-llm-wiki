import { describe, it, expect } from "vitest";
import { createStubProvider } from "./ai-provider";
import { chatResponse, generateGreeting } from "./chat";
import { processUrlWithLlm } from "./url-process";

describe("StubLanguageModelProvider", () => {
  it("returns canned chat response", async () => {
    const provider = createStubProvider({ chat: "stub chat" });
    const result = await provider.chat([
      { role: "user", content: "hello" },
    ]);
    expect(result).toBe("stub chat");
  });

  it("returns canned greeting", async () => {
    const provider = createStubProvider({ greet: "stub greeting" });
    const result = await provider.greet("path.md", "content");
    expect(result).toBe("stub greeting");
  });

  it("returns canned proposal", async () => {
    const provider = createStubProvider({ propose: "stub proposal" });
    const result = await provider.propose([
      { role: "user", content: "hello" },
    ]);
    expect(result).toBe("stub proposal");
  });

  it("returns canned url processing", async () => {
    const provider = createStubProvider({ processUrl: "stub url" });
    const result = await provider.processUrl("<html>", "https://example.com");
    expect(result).toBe("stub url");
  });

  it("returns defaults when no response configured", async () => {
    const provider = createStubProvider();
    expect(await provider.chat([])).toBe("Stub chat response");
    expect(await provider.greet("x", "y")).toBe("Stub greeting");
    expect(await provider.propose([])).toBe("Stub proposal");
    expect(await provider.processUrl("x", "y")).toBe("Stub URL response");
  });
});

describe("chatResponse delegates to provider", () => {
  it("returns the provider chat result", async () => {
    const provider = createStubProvider({ chat: "delegated chat" });
    const result = await chatResponse(provider, [
      { role: "user", content: "hi" },
    ]);
    expect(result).toBe("delegated chat");
  });
});

describe("generateGreeting delegates to provider", () => {
  it("returns the provider greet result", async () => {
    const provider = createStubProvider({ greet: "delegated greeting" });
    const result = await generateGreeting(provider, "path.md", "content");
    expect(result).toBe("delegated greeting");
  });
});

describe("processUrlWithLlm delegates to provider", () => {
  it("returns the provider processUrl result", async () => {
    const provider = createStubProvider({ processUrl: "delegated url" });
    const result = await processUrlWithLlm(provider, "<html>", "https://example.com");
    expect(result).toBe("delegated url");
  });
});
