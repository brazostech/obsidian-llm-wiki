import React, { useState, useCallback, useRef, useEffect } from "react";
import LlmWikiPlugin from "../main";
import { IngestPhase, ChatMessage, IngestSession } from "../types";
import { SourceSelector } from "./SourceSelector";
import { ChatPanel, AnimatedProposingStatus } from "./ChatPanel";
import { ProposalChecklist } from "./ProposalChecklist";
import { generateGreeting } from "../ai/chat";
import { generateProposal, Proposal } from "../ai/propose";
import { WikiReader } from "../wiki/reader";
import { WikiWriter } from "../wiki/writer";
import { SessionManager } from "../sessions/manager";
import { buildWikiContext } from "../ai/wikiContext";
import { createLanguageModelProvider } from "../ai/ai-provider";

interface Props {
  plugin: LlmWikiPlugin;
  onEnterChat?: () => void;
  onBackToOverview?: () => void;
}

export const IngestApp: React.FC<Props> = ({ plugin, onEnterChat, onBackToOverview }) => {
  const [phase, setPhase] = useState<IngestPhase>("SELECT");
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [sourceContent, setSourceContent] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProposing, setIsProposing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  const sessionManager = useRef(new SessionManager(plugin.app));
  const provider = useRef(createLanguageModelProvider({
    model: plugin.settings.model,
    apiKey: plugin.settings.zenApiKey,
  }));

  const saveSession = useCallback(
    (overridePhase?: IngestPhase, overrideMessages?: ChatMessage[], overrideProposal?: Proposal | null) => {
      if (!sourcePath) return;
      const session: IngestSession = {
        sourcePath,
        sourceContent,
        phase: overridePhase || phase,
        messages: overrideMessages || messagesRef.current,
        proposal: overrideProposal !== undefined ? overrideProposal : proposal,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      sessionManager.current.save(session).catch((e) => {
        console.error("[LLM Wiki] Failed to save session:", e);
      });
    },
    [sourcePath, sourceContent, phase, proposal]
  );

  // Auto-save whenever messages or phase changes
  useEffect(() => {
    if (sourcePath && phase !== "SELECT") {
      saveSession();
    }
  }, [messages, phase, proposal, sourcePath, saveSession]);

  const handleBackToSelect = useCallback(() => {
    setPhase("SELECT");
    setSourcePath(null);
    setSourceContent("");
    setMessages([]);
    messagesRef.current = [];
    setProposal(null);
    setIsLoading(false);
    setRefreshKey((k) => k + 1); // force SourceSelector to re-scan sessions
    onBackToOverview?.();
  }, [onBackToOverview]);

  const handleSourceSelected = useCallback(
    async (path: string, content: string) => {
      setSourcePath(path);
      setSourceContent(content);

      const existingSession = await sessionManager.current.load(path);
      if (existingSession) {
        // Resume session: restore messages
        setMessages(existingSession.messages);
        messagesRef.current = existingSession.messages;
        setProposal(existingSession.proposal);

        // If resuming from DONE phase, inject context message and reset to CHAT
        if (existingSession.phase === "DONE") {
          setPhase("CHAT");
          // Build wiki context to show existing pages
          const reader = new WikiReader(
            plugin.app,
            plugin.settings.rawPath,
            plugin.settings.wikiPath
          );
          const wikiCtx = await buildWikiContext(reader, path, { includeFullContent: true });
          const resumeMsg: ChatMessage = {
            role: "assistant",
            content: `You've previously ingested this source. ${wikiCtx}\n\nWhat would you like to change or add?`,
          };
          setMessages([...existingSession.messages, resumeMsg]);
          messagesRef.current = [...existingSession.messages, resumeMsg];
        } else {
          setPhase("CHAT");
        }

        onEnterChat?.();
        return;
      }

      // Fresh ingestion: generate greeting
      setPhase("CHAT");
      onEnterChat?.();
setIsLoading(true);
      try {
        const greeting = await provider.current.greet(path, content);
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: greeting,
        };
        setMessages([assistantMsg]);
        messagesRef.current = [assistantMsg];
      } catch (e: any) {
        const fallbackMsg: ChatMessage = {
          role: "assistant",
          content: `I see you've selected **${path}**. What would you like to capture from this source?`,
        };
        setMessages([fallbackMsg]);
        messagesRef.current = [fallbackMsg];
      } finally {
        setIsLoading(false);
      }
    },
    [plugin, onEnterChat]
  );

  const buildLlmMessages = useCallback(
    async (chatMessages: ChatMessage[]): Promise<Array<{ role: "user" | "assistant"; content: string }>> => {
      const reader = new WikiReader(
        plugin.app,
        plugin.settings.rawPath,
        plugin.settings.wikiPath
      );
      const wikiCtx = await buildWikiContext(reader, sourcePath!);

      return [
        {
          role: "user" as const,
          content: `Source: ${sourcePath}\n\n${sourceContent}`,
        },
        {
          role: "assistant" as const,
          content: wikiCtx,
        },
        ...chatMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];
    },
    [plugin, sourcePath, sourceContent]
  );

  const handleSendMessage = useCallback(
    async (text: string) => {
      const newMessages: ChatMessage[] = [
        ...messagesRef.current,
        { role: "user", content: text },
      ];
      setMessages(newMessages);
      messagesRef.current = newMessages;
      setIsLoading(true);

try {
        const llmMessages = await buildLlmMessages(newMessages);

        const response = await provider.current.chat(llmMessages);

        const assistantMsg = {
          role: "assistant" as const,
          content: response,
        };
        const updated = [...newMessages, assistantMsg];
        setMessages(updated);
        messagesRef.current = updated;
      } catch (e: any) {
        const errMsg = {
          role: "assistant" as const,
          content: `Error: ${e.message}`,
        };
        const updated = [...newMessages, errMsg];
        setMessages(updated);
        messagesRef.current = updated;
      } finally {
        setIsLoading(false);
      }
    },
    [buildLlmMessages]
  );

  const handleCommit = useCallback(async () => {
    setIsProposing(true);
    try {
      const llmMessages = await buildLlmMessages(messagesRef.current);

      const result = await generateProposal(
        provider.current,
        llmMessages
      );
      setProposal(result);
      setPhase("PROPOSE");
    } catch (e: any) {
      alert(`Failed to generate proposal: ${e.message}`);
    } finally {
      setIsProposing(false);
    }
  }, [buildLlmMessages, plugin]);

  const handleApply = useCallback(
    async (actions: Proposal["actions"], fullProposal: Proposal) => {
      setPhase("APPLY");
      setIsLoading(true);
      const writer = new WikiWriter(plugin.app);
      try {
        await writer.applyProposal(
          fullProposal,
          plugin.settings.indexPath,
          plugin.settings.logPath
        );
        setPhase("DONE");
        saveSession("DONE", messagesRef.current, fullProposal);
        await sessionManager.current.cleanup(5);
      } catch (e: any) {
        alert(`Failed to apply: ${e.message}`);
      } finally {
        setIsLoading(false);
      }
    },
    [plugin, saveSession]
  );

  return (
    <div className="llm-wiki-ingest-app">
      {phase === "SELECT" && (
        <SourceSelector plugin={plugin} onSelect={handleSourceSelected} refreshKey={refreshKey} />
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
          onCancel={() => setPhase("CHAT")}
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
