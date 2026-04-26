import React, { useState, useEffect, useRef } from "react";
import { ProgressSteps, Step } from "./ProgressSteps";
import { createLanguageModelProvider } from "../ai/ai-provider";
import { SourceIngestion } from "../wiki/source-ingestion";
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

  const sourceIngestion = useRef(
    new SourceIngestion(
      plugin.app,
      plugin.settings.rawPath,
      plugin.settings.wikiPath,
      createLanguageModelProvider({
        model: plugin.settings.model,
        apiKey: plugin.settings.zenApiKey,
      })
    )
  );

  // Keep a ref to the latest onSelect so setTimeout closures are never stale
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const loadRecent = async () => {
      try {
        const files = await sourceIngestion.current.listRecentFiles(5);
        setRecentFiles(files);
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
    const result = await sourceIngestion.current.selectFile(path);
    if (result.hasSession) {
      setSelectedHasSession(true);
      setSelectedMessageCount(result.messageCount);
      setSelectedLastActive(result.lastActive);
      setSelectedPreview("");
    } else {
      setSelectedHasSession(false);
      setSelectedMessageCount(0);
      setSelectedLastActive(null);
      if (result.content) {
        setSelectedPreview(result.content.slice(0, 500));
      }
    }
  };

  const handleIngestSelected = async () => {
    if (!selectedFile) return;
    const result = await sourceIngestion.current.selectFile(selectedFile);
    onSelect(result.path, result.content);
  };

  const handlePaste = async () => {
    if (!pasteContent.trim()) return;
    const result = await sourceIngestion.current.pasteContent(pasteContent);
    onSelect(result.path, result.content);
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
      const result = await sourceIngestion.current.fetchUrl(url.trim());
      updateStep("fetch", "complete", `${result.content.length.toLocaleString()} chars fetched`);
      updateStep("process", "complete", "Processed with LLM");
      updateStep("save", "complete", result.path);
      onSelectRef.current(result.path, result.content);
    } catch (e: any) {
      updateStep("fetch", "error", e.message);
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
                {selectedFileData?.hasSession ? "Update / Modify" : "Ingest this source"}
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
