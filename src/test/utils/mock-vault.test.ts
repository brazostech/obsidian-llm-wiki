import { describe, it, expect, beforeEach } from "vitest";
import { createMockApp, InMemoryVault } from "./mock-vault";

describe("InMemoryVault", () => {
  let vault: InMemoryVault;

  beforeEach(() => {
    vault = createMockApp({
      "raw/test.md": "# Test Source\n\nSome content here.",
      "raw/another.md": "# Another Source\n\nMore content.",
      "wiki/index.md": "# Wiki Index\n\n## Topics\n\n- [[topics/foo]]",
    });
  });

  it("stores and retrieves files", async () => {
    const files = vault.getFiles();
    expect(files.length).toBe(3);
  });

  it("gets files by path", () => {
    const file = vault.getAbstractFileByPath("raw/test.md");
    expect(file).not.toBeNull();
    expect(file?.name).toBe("test.md");
  });

  it("reads file content", async () => {
    const file = vault.getAbstractFileByPath("raw/test.md");
    expect(file).not.toBeNull();
    const content = await vault.read(file as any);
    expect(content).toContain("Some content here");
  });

  it("creates new files", async () => {
    await vault.create("raw/new-file.md", "# New File\n\nContent");
    const file = vault.getAbstractFileByPath("raw/new-file.md");
    expect(file).not.toBeNull();
  });

  it("modifies existing files", async () => {
    const file = vault.getAbstractFileByPath("raw/test.md")!;
    await vault.modify(file as any, "# Test Source\n\nUpdated content");
    const content = await vault.read(file as any);
    expect(content).toContain("Updated content");
  });

  it("creates folders", async () => {
    await vault.createFolder("raw/subfolder");
    const folder = vault.getAbstractFileByPath("raw/subfolder");
    expect(folder).not.toBeNull();
  });

  it("deletes files", async () => {
    const file = vault.getAbstractFileByPath("raw/test.md")!;
    await vault.delete(file as any);
    const deleted = vault.getAbstractFileByPath("raw/test.md");
    expect(deleted).toBeNull();
  });

  it("simulates cache miss", async () => {
    const file = vault.getAbstractFileByPath("raw/test.md");
    expect(file).not.toBeNull();
    vault.simulateCacheMiss("raw/test.md");
    const afterMiss = vault.getAbstractFileByPath("raw/test.md");
    expect(afterMiss).toBeNull();
  });

  it("simulates the vault cache race condition", async () => {
    vault.addFile("existing/file.md", "# exists");
    vault.simulateCacheMiss("existing/file.md");
    const afterMiss = vault.getAbstractFileByPath("existing/file.md");
    expect(afterMiss).toBeNull();
  });
});