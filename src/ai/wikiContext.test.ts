import { describe, it, expect } from "vitest";
import { buildWikiContext } from "./wikiContext";
import type { WikiPageInfo } from "../wiki/reader";

class MockWikiReader {
  private pages: WikiPageInfo[] = [];
  private contents: Map<string, string> = new Map();

  setPages(pages: WikiPageInfo[]) {
    this.pages = pages;
  }

  setContent(path: string, content: string) {
    this.contents.set(path, content);
  }

  async listWikiPages(): Promise<WikiPageInfo[]> {
    return this.pages;
  }

  async findPagesCitingSource(_slug: string): Promise<WikiPageInfo[]> {
    return this.pages.filter((p) => p.sources.length > 0);
  }

  async readFile(path: string): Promise<string | null> {
    return this.contents.get(path) || null;
  }
}

describe("buildWikiContext", () => {
  it("returns empty wiki message when no pages exist", async () => {
    const reader = new MockWikiReader();
    const result = await buildWikiContext(reader as any, "raw/test.md");
    expect(result).toContain("empty");
  });

  it("lists non-citing pages without full content by default", async () => {
    const reader = new MockWikiReader();
    reader.setPages([
      { path: "wiki/page1.md", title: "Page 1", sources: [], summary: "Summary one" },
      { path: "wiki/page2.md", title: "Page 2", sources: [], summary: "Summary two" },
    ]);

    const result = await buildWikiContext(reader as any, "raw/test.md");
    expect(result).toContain("Page 1");
    expect(result).toContain("Page 2");
    expect(result).not.toContain("Summary one");
  });

  it("shows 120-char preview for citing pages when includeFullContent is false", async () => {
    const reader = new MockWikiReader();
    const longSummary = "This is a very long summary that exceeds one hundred and twenty characters easily when we keep typing more and more words here to make it definitely longer than the limit";
    reader.setPages([
      { path: "wiki/page1.md", title: "Page 1", sources: ["test"], summary: longSummary },
    ]);

    const result = await buildWikiContext(reader as any, "raw/test.md");
    expect(result).toContain("preview:");
    // The preview is truncated at 120 chars, so the end of the summary should not appear
    expect(result).not.toContain("definitely longer than the limit");
  });

  it("includes full content of citing pages under the cap", async () => {
    const reader = new MockWikiReader();
    reader.setPages([
      { path: "wiki/page1.md", title: "Page 1", sources: ["test"], summary: "s1" },
      { path: "wiki/page2.md", title: "Page 2", sources: ["test"], summary: "s2" },
    ]);
    reader.setContent("wiki/page1.md", "Content of page one.");
    reader.setContent("wiki/page2.md", "Content of page two.");

    const result = await buildWikiContext(reader as any, "raw/test.md", { includeFullContent: true });
    expect(result).toContain("Content of page one.");
    expect(result).toContain("Content of page two.");
  });

  it("truncates a single very large citing page at maxPageSize", async () => {
    const reader = new MockWikiReader();
    const largeContent = "x".repeat(15000);
    reader.setPages([
      { path: "wiki/big.md", title: "Big", sources: ["test"], summary: "big" },
    ]);
    reader.setContent("wiki/big.md", largeContent);

    const result = await buildWikiContext(reader as any, "raw/test.md", {
      includeFullContent: true,
      maxPageSize: 5000,
      maxTotalSize: 30000,
    });
    expect(result).toContain("... [truncated]");
    expect(result.length).toBeLessThan(result.indexOf("... [truncated]") + 10000);
  });

  it("cites total content at maxTotalSize, keeping pages until cap is reached", async () => {
    const reader = new MockWikiReader();
    const page1Content = "a".repeat(3000);
    const page2Content = "b".repeat(3000);
    const page3Content = "c".repeat(3000);

    reader.setPages([
      { path: "wiki/p1.md", title: "P1", sources: ["test"], summary: "s1" },
      { path: "wiki/p2.md", title: "P2", sources: ["test"], summary: "s2" },
      { path: "wiki/p3.md", title: "P3", sources: ["test"], summary: "s3" },
    ]);
    reader.setContent("wiki/p1.md", page1Content);
    reader.setContent("wiki/p2.md", page2Content);
    reader.setContent("wiki/p3.md", page3Content);

    const result = await buildWikiContext(reader as any, "raw/test.md", {
      includeFullContent: true,
      maxPageSize: 10000,
      maxTotalSize: 5000,
    });

    // Should include p1 full content
    expect(result).toContain("--- wiki/p1.md ---");
    // p2 and p3 full content should be excluded because total would exceed 5000
    expect(result).not.toContain("--- wiki/p2.md ---");
    expect(result).not.toContain("--- wiki/p3.md ---");
  });

  it("warns to use UPDATE for citing pages", async () => {
    const reader = new MockWikiReader();
    reader.setPages([
      { path: "wiki/page1.md", title: "Page 1", sources: ["test"], summary: "s" },
    ]);

    const result = await buildWikiContext(reader as any, "raw/test.md");
    expect(result).toContain("Use UPDATE (not CREATE)");
  });
});
