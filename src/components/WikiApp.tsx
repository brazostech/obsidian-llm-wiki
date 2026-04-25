import React, { useState } from "react";
import LlmWikiPlugin from "../main";
import { IngestApp } from "./IngestApp";
import { QueryPanel } from "./QueryPanel";

interface Props {
  plugin: LlmWikiPlugin;
}

type WikiView = "overview" | "query";

export const WikiApp: React.FC<Props> = ({ plugin }) => {
  const [view, setView] = useState<WikiView>("overview");
  const [queryInput, setQueryInput] = useState("");
  const [initialQuery, setInitialQuery] = useState<string | null>(null);
  const [ingestActive, setIngestActive] = useState(false);

  const handleAskQuery = () => {
    if (!queryInput.trim()) return;
    setInitialQuery(queryInput.trim());
    setView("query");
  };

  const handleBackToOverview = () => {
    setView("overview");
    setInitialQuery(null);
    setIngestActive(false);
  };

  const handleEnterIngest = () => {
    setIngestActive(true);
  };

  if (view === "query" && initialQuery) {
    return (
      <div className="llm-wiki-app">
        <QueryPanel initialQuery={initialQuery} onBack={handleBackToOverview} />
      </div>
    );
  }

  return (
    <div className="llm-wiki-app">
      {/* Query Section */}
      <div className={`llm-wiki-section ${ingestActive ? "llm-wiki-hidden" : ""}`}>
        <div className="llm-wiki-section-header">Query</div>
        <div className="llm-wiki-query-compact">
          <textarea
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Ask your wiki..."
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAskQuery();
              }
            }}
          />
          <button
            onClick={handleAskQuery}
            disabled={!queryInput.trim()}
          >
            Ask Wiki
          </button>
          <span className="llm-wiki-hint">
            Coming soon — search and synthesize across your wiki pages
          </span>
        </div>
      </div>

      {/* Ingest Section */}
      <div className={`llm-wiki-section llm-wiki-section-ingest ${ingestActive ? "llm-wiki-ingest-active" : ""}`}>
        <div className={`llm-wiki-section-header ${ingestActive ? "llm-wiki-hidden" : ""}`}>Ingest</div>
        <div className="llm-wiki-section-body">
          <IngestApp
            plugin={plugin}
            onEnterChat={handleEnterIngest}
            onBackToOverview={handleBackToOverview}
          />
        </div>
      </div>

      {/* Lint Section */}
      <div className={`llm-wiki-section ${ingestActive ? "llm-wiki-hidden" : ""}`}>
        <div className="llm-wiki-section-header">Lint</div>
        <div className="llm-wiki-lint-strip">
          <button disabled>Lint Wiki</button>
          <span className="llm-wiki-hint">
            Coming soon — check contradictions, orphans, and stale info
          </span>
        </div>
      </div>
    </div>
  );
};
