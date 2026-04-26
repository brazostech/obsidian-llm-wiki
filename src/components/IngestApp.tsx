import React, { useState, useCallback, useRef, useEffect } from "react";
import LlmWikiPlugin from "../main";
import { IngestPhase, ChatMessage } from "../types";
import { Proposal } from "../ai/propose";
import { SourceSelector } from "./SourceSelector";
import { ChatPanel, AnimatedProposingStatus } from "./ChatPanel";
import { ProposalChecklist } from "./ProposalChecklist";
import { IngestPipeline } from "../pipeline/ingest-pipeline";
import { createLanguageModelProvider } from "../ai/ai-provider";

interface Props {
  plugin: LlmWikiPlugin;
  onEnterChat?: () => void;
  onBackToOverview?: () => void;
}

export const IngestApp: React.FC<Props> = ({ plugin, onEnterChat, onBackToOverview }) => {
  const [phase, setPhase] = useState<IngestPhase>("SELECT");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProposing, setIsProposing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const pipelineRef = useRef<IngestPipeline | null>(null);
  const onEnterChatRef = useRef(onEnterChat);
  const onBackToOverviewRef = useRef(onBackToOverview);

  onEnterChatRef.current = onEnterChat;
  onBackToOverviewRef.current = onBackToOverview;

  useEffect(() => {
    const provider = createLanguageModelProvider({
      model: plugin.settings.model,
      apiKey: plugin.settings.zenApiKey,
    });
    const pipeline = new IngestPipeline(plugin.app, provider, plugin.settings);

    pipeline.on("phaseChange", (p) => {
      setPhase(p);
      if (p === "CHAT") {
        onEnterChatRef.current?.();
      }
    });
    pipeline.on("message", () => {
      setMessages([...pipeline.currentMessages]);
    });
    pipeline.on("proposal", (p) => {
      setProposal(p);
      setIsProposing(false);
    });
    pipeline.on("error", (err) => {
      alert(err.message);
      setIsProposing(false);
    });
    pipeline.on("loadingChange", (loading) => {
      setIsLoading(loading);
    });

    pipelineRef.current = pipeline;
    return () => {
      // No explicit cleanup needed for pipeline
    };
  }, [plugin]);

  const handleBackToSelect = useCallback(() => {
    pipelineRef.current?.reset();
    setMessages([]);
    setProposal(null);
    setRefreshKey((k) => k + 1);
    onBackToOverviewRef.current?.();
  }, []);

  const handleSourceSelected = useCallback(
    async (path: string, content: string) => {
      setMessages([]);
      await pipelineRef.current?.selectSource(path, content);
    },
    []
  );

  const handleSendMessage = useCallback(async (text: string) => {
    await pipelineRef.current?.sendMessage(text);
  }, []);

  const handleCommit = useCallback(async () => {
    setIsProposing(true);
    try {
      await pipelineRef.current?.commitAndPropose();
    } catch {
      // Error is emitted via event and surfaced in alert
    }
  }, []);

  const handleApply = useCallback(
    async (actions: Proposal["actions"]) => {
      try {
        await pipelineRef.current?.applyProposal(actions);
      } catch {
        // Error is emitted via event and surfaced in alert
      }
    },
    []
  );

  return (
    <div className="llm-wiki-ingest-app">
      {phase === "SELECT" && (
        <SourceSelector
          plugin={plugin}
          onSelect={handleSourceSelected}
          refreshKey={refreshKey}
        />
      )}
      {phase === "CHAT" && (
        <ChatPanel
          messages={messages}
          isLoading={isLoading}
          onSend={handleSendMessage}
          onBack={handleBackToSelect}
          backLabel="← Back to sources"
          phaseLabel="Discussion"
          actions={
            <button
              type="button"
              disabled={isLoading || messages.length < 2}
              onClick={handleCommit}
            >
              Commit &amp; Propose
            </button>
          }
          statusOverlay={
            isProposing ? <AnimatedProposingStatus /> : undefined
          }
        />
      )}
      {phase === "PROPOSE" && proposal && (
        <ProposalChecklist
          proposal={proposal}
          onApply={handleApply}
          onCancel={() => pipelineRef.current?.backToChat()}
        />
      )}
      {phase === "APPLY" && (
        <div className="llm-wiki-phase">Applying changes...</div>
      )}
      {phase === "DONE" && (
        <div className="llm-wiki-phase llm-wiki-done">
          <div>Ingest complete!</div>
          <button
            className="llm-wiki-done-btn"
            onClick={handleBackToSelect}
          >
            Start another ingestion
          </button>
        </div>
      )}
    </div>
  );
};
