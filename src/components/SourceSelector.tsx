import React, { useState, useEffect } from "react";
import { requestUrl } from "obsidian";
import { WikiReader } from "../wiki/reader";
import { WikiWriter } from "../wiki/writer";
import { processUrlWithLlm } from "../ai/url-process";
import { ProgressSteps, Step } from "./ProgressSteps";
import LlmWikiPlugin from "../main";

interface Props {
  plugin: LlmWikiPlugin;
  onSelect: (path: string, content: string) => void;
}

const DEFAULT_URL_STEPS: Step[] = [
  { id: "fetch", label: "Fetching page from URL", status: "pending" },
  { id: "process", label: "Processing content with LLM", status: "pending" },
  { id: "save", label: "Saving to vault", status: "pending" },
];

export const SourceSelector: React.FC<Props> = ({ plugin, onSelect }) => {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<string>("");
  const [tab, setTab] = useState<"file" | "paste" | "url">("file");
  const [pasteContent, setPasteContent] = useState("");
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [urlSteps, setUrlSteps] = useState<Step[]>(DEFAULT_URL_STEPS);

  useEffect(() => {
    const reader = new WikiReader(
      plugin.app,
      plugin.settings.rawPath,
      plugin.settings.wikiPath
    );
    reader.listRawFiles().then(setFiles);
  }, [plugin]);

  const handleSelectFile = async (path: string) => {
    setSelectedFile(path);
    const reader = new WikiReader(
      plugin.app,
      plugin.settings.rawPath,
      plugin.settings.wikiPath
    );
    const content = await reader.readFile(path);
    if (content !== null) {
      // Show first 500 chars as preview
      setSelectedPreview(content.slice(0, 500));
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
    setUrlSteps(DEFAULT_URL_STEPS.map((s) => ({ ...s, status: "pending" as const })));

    try {
      // Step 1: Fetch raw HTML
      updateStep("fetch", "active");
      const response = await requestUrl({ url: url.trim(), method: "GET" });
      const html = response.text;
      updateStep("fetch", "complete", `${html.length.toLocaleString()} chars received`);

      // Step 2: Send to LLM for intelligent extraction & markdown conversion
      updateStep("process", "active");
      const markdown = await processUrlWithLlm(
        html,
        url.trim(),
        plugin.settings.model,
        plugin.settings.zenApiKey
      );
      updateStep("process", "complete", `${markdown.length.toLocaleString()} chars extracted`);

      // Step 3: Save LLM-produced markdown to raw/
      updateStep("save", "active");
      const slug = `fetched-${Date.now()}`;
      const path = `${plugin.settings.rawPath}/${slug}.md`;
      const writer = new WikiWriter(plugin.app);
      await writer.createFile(path, markdown);
      updateStep("save", "complete", path);

      // Small delay so user sees the final checkmark before transition
      setTimeout(() => onSelect(path, markdown), 400);
    } catch (e: any) {
      const failedStep = urlSteps.find((s) => s.status === "active")?.id || "fetch";
      updateStep(failedStep, "error", e.message);
    } finally {
      setIsLoading(false);
    }
  };

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
          <div className="llm-wiki-file-list">
            {files.length === 0 && (
              <div>No files found in {plugin.settings.rawPath}</div>
            )}
            {files.map((f) => (
              <div
                key={f}
                className={`llm-wiki-file-item ${selectedFile === f ? "selected" : ""}`}
                onClick={() => handleSelectFile(f)}
              >
                {f.replace(`${plugin.settings.rawPath}/`, "")}
              </div>
            ))}
          </div>
          {selectedFile && (
            <div className="llm-wiki-file-preview">
              <h4>{selectedFile.replace(`${plugin.settings.rawPath}/`, "")}</h4>
              <pre className="llm-wiki-preview-text">{selectedPreview}</pre>
              <button
                className="llm-wiki-ingest-btn"
                onClick={handleIngestSelected}
                disabled={isLoading}
              >
                Ingest this source
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
            <button
              onClick={handleFetchUrl}
              disabled={!url.trim()}
            >
              Fetch & Ingest
            </button>
          )}
          {isLoading && <ProgressSteps steps={urlSteps} />}
        </div>
      )}
    </div>
  );
};
