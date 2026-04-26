import { WikiReader, WikiPageInfo } from "../wiki/reader";

export interface WikiContextOptions {
  includeFullContent?: boolean;
  maxTotalSize?: number;
  maxPageSize?: number;
}

const DEFAULT_OPTIONS: WikiContextOptions = {
  includeFullContent: false,
  maxTotalSize: 30 * 1024,
  maxPageSize: 10 * 1024,
};

export async function buildWikiContext(
  reader: WikiReader,
  sourcePath: string,
  options: WikiContextOptions = DEFAULT_OPTIONS
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const slug = sourcePath
    .split("/")
    .pop()!
    .replace(/\.md$/, "")
    .toLowerCase();

  const [allPages, citingPages] = await Promise.all([
    reader.listWikiPages(),
    reader.findPagesCitingSource(slug),
  ]);

  if (allPages.length === 0) {
    return "EXISTING WIKI: (empty — no pages exist yet)";
  }

  const lines: string[] = [`EXISTING WIKI (${allPages.length} pages):`];
  const citingPaths = new Set(citingPages.map((p) => p.path));

  const citingContentLines: string[] = [];

  for (const page of citingPages) {
    lines.push(`  → ${page.path} [CITES THIS SOURCE]`);

    if (opts.includeFullContent) {
      try {
        const content = await reader.readFile(page.path);
        if (content) {
          const truncated =
            content.length > opts.maxPageSize!
              ? content.slice(0, opts.maxPageSize!) + "\n\n... [truncated]"
              : content;
          citingContentLines.push(`\n--- ${page.path} ---\n${truncated}\n---`);
        }
      } catch (e) {
        lines.push(`    (could not read full content)`);
      }
    } else {
      if (page.summary) {
        lines.push(`    preview: ${page.summary.slice(0, 120)}…`);
      }
    }
  }

  if (opts.includeFullContent && citingContentLines.length > 0) {
    let runningTotal = 0;
    const keptContent: string[] = [];
    for (const content of citingContentLines) {
      if (runningTotal + content.length <= opts.maxTotalSize!) {
        keptContent.push(content);
        runningTotal += content.length;
      }
    }
    lines.push(...keptContent);
  }

  const otherPages = allPages.filter((p) => !citingPaths.has(p.path));
  for (const page of otherPages.slice(0, 30)) {
    lines.push(`  - ${page.path} ("${page.title}")`);
  }
  if (otherPages.length > 30) {
    lines.push(`  … and ${otherPages.length - 30} more`);
  }

  lines.push(
    `\nIMPORTANT: Pages marked [CITES THIS SOURCE] already exist. Use UPDATE (not CREATE) for them.`
  );

  return lines.join("\n");
}