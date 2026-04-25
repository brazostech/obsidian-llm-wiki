import React, { useState, useEffect, useRef } from "react";
import { requestUrl } from "obsidian";
import { WikiReader } from "../wiki/reader";
import { WikiWriter } from "../wiki/writer";
import { processUrlWithLlm } from "../ai/url-process";
import { ProgressSteps, Step } from "./ProgressSteps";
import { parseFrontmatter } from "../wiki/frontmatter";
import { SessionManager } from "../sessions/manager";
import LlmWikiPlugin from "../main";

interface Props {
  plugin: LlmWikiPlugin;
  onSelect: (path: string, content: string) => void;
  refreshKey?: number;
}

const DEFAULT_URL_STEPS: Step[] = [
  { id: "fetch", label: "Fetching page from URL", status: "pending" },
  { id: "process", label: "Processing content with LLM", status: "pending" },
  { id: "save", label: "Saving to vault", status: "pending" },
];

interface RecentFile {
  path: string;
  title: string;
  filename: string;
  hasSession: boolean;
  messageCount: number;
  lastActive: number | null;
}

function extractTitleFromRawFrontmatter(content: string): string | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fmMatch) return null;
  const titleMatch = fmMatch[1].match(/^title:\s*(.+)$/m);
  if (titleMatch) {
    let title = titleMatch[1].trim();
    if (
      (title.startsWith('"') && title.endsWith('"')) ||
      (title.startsWith("'") && title.endsWith("'"))
    ) {
      title = title.slice(1, -1);
    }
    return title;
  }
  return null;
}

function extractTitle(content: string, basename: string): string {
  try {
    const { frontmatter, body } = parseFrontmatter(content);
    if (frontmatter.title && typeof frontmatter.title === "string") {
      return frontmatter.title;
    }
    const h1Match = body.match(/^#\s+(.+)$/m);
    if (h1Match) {
      return h1Match[1].trim();
    }
  } catch (e: any) {
    console.warn(
      "[LLM Wiki] Strict frontmatter parse failed, trying regex fallback:",
      e.message
    );
  }

  const rawTitle = extractTitleFromRawFrontmatter(content);
  if (rawTitle) {
    return rawTitle;
  }

  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  return basename;
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const SourceSelector: React.FC<Props> = ({ plugin, onSelect, refreshKey = 0 }) => {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<string>("");
  const [selectedHasSession, setSelectedHasSession] = useState(false);
  const [selectedMessageCount, setSelectedMessageCount] = useState(0);
  const [selectedLastActive, setSelectedLastActive] = useState<number | null>(null);
  const [tab, setTab] = useState<"file" | "paste" | "url">("file");
  const [pasteContent, setPasteContent] = useState("");
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [urlSteps, setUrlSteps] = useState<Step[]>(DEFAULT_URL_STEPS);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);

  // Keep a ref to the latest onSelect so setTimeout closures are never stale
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const loadRecent = async () => {
      try {
        const reader = new WikiReader(
          plugin.app,
          plugin.settings.rawPath,
          plugin.settings.wikiPath
        );
        const sessionManager = new SessionManager(plugin.app);
        const recent = await reader.listRecentRawFiles(5);
        const enriched = await Promise.all(
          recent.map(async (f) => {
            const content = (await reader.readFile(f.path)) || "";
            const title = extractTitle(content, f.basename);
            const session = await sessionManager.load(f.path);
            return {
              path: f.path,
              title,
              filename: f.basename,
              hasSession: !!session,
              messageCount: session?.messages?.length || 0,
              lastActive: session?.updatedAt || null,
            };
          })
        );
        setRecentFiles(enriched);
      } catch (e: any) {
        console.error("[LLM Wiki] Failed to load recent files:", e);
      } finally {
        setIsLoadingFiles(false);
      }
    };
    loadRecent();
  }, [plugin, refreshKey]);

  const handleSelectFile = async (path: string) => {
    setSelectedFile(path);
    const reader = new WikiReader(
      plugin.app,
      plugin.settings.rawPath,
      plugin.settings.wikiPath
    );
    const sessionManager = new SessionManager(plugin.app);
    const content = await reader.readFile(path);
    const session = await sessionManager.load(path);
    if (session) {
      setSelectedHasSession(true);
      setSelectedMessageCount(session.messages?.length || 0);
      setSelectedLastActive(session.updatedAt || null);
      setSelectedPreview("");
    } else {
      setSelectedHasSession(false);
      setSelectedMessageCount(0);
      setSelectedLastActive(null);
      if (content !== null) {
        setSelectedPreview(content.slice(0, 500));
      }
    }
  };

  const handleIngestSelected = async () => {
    if (!selectedFile) return;
    const reader = new WikiReader(
      plugin.app,
      plugin.settings.rawPath,
      plugin.settings.wikiPath
    );
    const content = await reader.readFile(selectedFile);
    if (content !== null) {
      onSelect(selectedFile, content);
    }
  };

  const handlePaste = async () => {
    if (!pasteContent.trim()) return;
    const slug = `pasted-${Date.now()}`;
    const path = `${plugin.settings.rawPath}/${slug}.md`;
    const writer = new WikiWriter(plugin.app);
    await writer.createFile(path, pasteContent);
    onSelect(path, pasteContent);
  };

  const updateStep = (id: string, status: Step["status"], detail?: string) => {
    setUrlSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status, detail } : s))
    );
  };

  const handleFetchUrl = async () => {
    if (!url.trim()) return;
    setIsLoading(true);
    setUrlSteps(
      DEFAULT_URL_STEPS.map((s) => ({ ...s, status: "pending" as const }))
    );

    try {
      updateStep("fetch", "active");
      const response = await requestUrl({ url: url.trim(), method: "GET" });
      const html = response.text;
      updateStep(
        "fetch",
        "complete",
        `${html.length.toLocaleString()} chars received`
      );

      updateStep("process", "active");
      const markdown = await processUrlWithLlm(
        html,
        url.trim(),
        plugin.settings.model,
        plugin.settings.zenApiKey
      );
      updateStep(
        "process",
        "complete",
        `${markdown.length.toLocaleString()} chars extracted`
      );

      updateStep("save", "active");
      const slug = `fetched-${Date.now()}`;
      const path = `${plugin.settings.rawPath}/${slug}.md`;
      const writer = new WikiWriter(plugin.app);
      await writer.createFile(path, markdown);
      updateStep("save", "complete", path);

      // Transition immediately to ingestion chat
      onSelectRef.current(path, markdown);
    } catch (e: any) {
      const failedStep =
        urlSteps.find((s) => s.status === "active")?.id || "fetch";
      updateStep(failedStep, "error", e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedFileData = recentFiles.find((f) => f.path === selectedFile);

  return (
    <div className="llm-wiki-source-selector">
      <div className="llm-wiki-tabs">
        <button
          className={tab === "file" ? "active" : ""}
          onClick={() => setTab("file")}
        >
          From raw/
        </button>
        <button
          className={tab === "paste" ? "active" : ""}
          onClick={() => setTab("paste")}
        >
          Paste
        </button>
        <button
          className={tab === "url" ? "active" : ""}
          onClick={() => setTab("url")}
        >
          Fetch URL
        </button>
      </div>
      {tab === "file" && (
        <div className="llm-wiki-file-browser">
          <div className="llm-wiki-recent-header">Recently Ingested</div>
          <div className="llm-wiki-file-list">
            {isLoadingFiles && <div>Loading...</div>}
            {!isLoadingFiles && recentFiles.length === 0 && (
              <div>No files found in {plugin.settings.rawPath}</div>
            )}
            {recentFiles.map((f) => (
              <div
                key={f.path}
                className={`llm-wiki-file-item ${selectedFile === f.path ? "selected" : ""}`}
                onClick={() => handleSelectFile(f.path)}
              >
                <div className="llm-wiki-file-item-title">{f.title}</div>
                <div className="llm-wiki-file-item-meta">
                  {f.filename}.md
                  {f.hasSession && (
                    <span className="llm-wiki-session-badge">
                      {" "}· {f.messageCount} msgs
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {selectedFile && (
            <div className="llm-wiki-file-preview">
              {selectedHasSession ? (
                <div className="llm-wiki-session-meta">
                  <div>Session saved — {selectedMessageCount} messages</div>
                  <div>
                    Last active: {selectedLastActive ? formatTimeAgo(selectedLastActive) : "unknown"}
                  </div>
                </div>
              ) : (
                <>
                  <h4>
                    {selectedFile.replace(`${plugin.settings.rawPath}/`, "")}
                  </h4>
                  <pre className="llm-wiki-preview-text">{selectedPreview}</pre>
                </>
              )}
              <button
                className="llm-wiki-ingest-btn"
                onClick={handleIngestSelected}
                disabled={isLoading}
              >
                {selectedFileData?.hasSession ? "Discuss & Update" : "Ingest this source"}
              </button>
            </div>
          )}
        </div>
      )}
      {tab === "paste" && (
        <div className="llm-wiki-paste">
          <textarea
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
            placeholder="Paste source content here..."
          />
          <button onClick={handlePaste} disabled={!pasteContent.trim()}>
            Save &amp; Ingest
          </button>
        </div>
      )}
      {tab === "url" && (
        <div className="llm-wiki-url">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/article"
            disabled={isLoading}
          />
          {!isLoading && (
            <button onClick={handleFetchUrl} disabled={!url.trim()}>
              Fetch &amp; Ingest
            </button>
          )}
          {isLoading && <ProgressSteps steps={urlSteps} />}
        </div>
      )}
    </div>
  );
};
