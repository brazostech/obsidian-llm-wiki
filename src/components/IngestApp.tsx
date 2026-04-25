import React, { useState, useCallback, useRef, useEffect } from "react";
import LlmWikiPlugin from "../main";
import { IngestPhase, ChatMessage, IngestSession } from "../types";
import { SourceSelector } from "./SourceSelector";
import { ChatPanel, AnimatedProposingStatus } from "./ChatPanel";
import { ProposalChecklist } from "./ProposalChecklist";
import { chatResponse, generateGreeting } from "../ai/chat";
import { generateProposal, Proposal } from "../ai/propose";
import { WikiReader } from "../wiki/reader";
import { WikiWriter } from "../wiki/writer";
import { SessionManager } from "../sessions/manager";

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
  const messagesRef = useRef<ChatMessage[]>([]);
  const sessionManager = useRef(new SessionManager(plugin.app));

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
    onBackToOverview?.();
  }, [onBackToOverview]);

  const handleSourceSelected = useCallback(
    async (path: string, content: string) => {
      setSourcePath(path);
      setSourceContent(content);

      const existingSession = await sessionManager.current.load(path);
      if (existingSession) {
        // Resume session: restore messages and jump to CHAT
        setMessages(existingSession.messages);
        messagesRef.current = existingSession.messages;
        setProposal(existingSession.proposal);
        setPhase("CHAT");
        onEnterChat?.();
        return;
      }

      // Fresh ingestion: generate greeting
      setPhase("CHAT");
      onEnterChat?.();
      setIsLoading(true);
      try {
        const greeting = await generateGreeting(
          plugin.settings.model,
          plugin.settings.zenApiKey,
          path,
          content
        );
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: greeting,
        };
        setMessages([assistantMsg]);
        messagesRef.current = [assistantMsg];
        // Session will auto-save via useEffect
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
        const llmMessages = [
          {
            role: "user" as const,
            content: `Source: ${sourcePath}\n\n${sourceContent}`,
          },
          ...newMessages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ];

        const response = await chatResponse(
          plugin.settings.model,
          plugin.settings.zenApiKey,
          llmMessages
        );

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
    [plugin, sourcePath, sourceContent]
  );

  const handleCommit = useCallback(async () => {
    setIsProposing(true);
    try {
      const llmMessages = [
        {
          role: "user" as const,
          content: `Source: ${sourcePath}\n\n${sourceContent}`,
        },
        ...messagesRef.current.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      const result = await generateProposal(
        plugin.settings.model,
        plugin.settings.zenApiKey,
        llmMessages
      );
      setProposal(result);
      setPhase("PROPOSE");
    } catch (e: any) {
      alert(`Failed to generate proposal: ${e.message}`);
    } finally {
      setIsProposing(false);
    }
  }, [plugin, sourcePath, sourceContent]);

  const handleApply = useCallback(
    async (actions: Proposal["actions"]) => {
      setPhase("APPLY");
      setIsLoading(true);
      const writer = new WikiWriter(plugin.app);
      const reader = new WikiReader(
        plugin.app,
        plugin.settings.rawPath,
        plugin.settings.wikiPath
      );
      try {
        for (const action of actions) {
          if (action.type === "CREATE") {
            await writer.createFile(action.path, action.content);
          } else {
            await writer.modifyFile(action.path, action.content);
          }
        }
        if (proposal && proposal.indexUpdates.length > 0) {
          const indexContent = await reader.readFile(plugin.settings.indexPath);
          let newIndex = indexContent || "";
          for (const update of proposal.indexUpdates) {
            const sectionHeader = `## ${update.section}`;
            const sectionIndex = newIndex.indexOf(sectionHeader);
            if (sectionIndex !== -1) {
              const afterHeader = sectionIndex + sectionHeader.length;
              newIndex =
                newIndex.slice(0, afterHeader) +
                "\n" +
                update.entry +
                newIndex.slice(afterHeader);
            }
          }
          await writer.modifyFile(plugin.settings.indexPath, newIndex);
        }
        if (proposal) {
          const logHeader = `## [${new Date().toISOString().split("T")[0]}] ingest | ${proposal.sourceSummary.slug}`;
          const logEntry = `${logHeader}\n${proposal.logEntry}\n`;
          await writer.appendToFile(plugin.settings.logPath, logEntry);
        }
        setPhase("DONE");
        // Save final state and cleanup old sessions
        saveSession("DONE", messagesRef.current, proposal);
        await sessionManager.current.cleanup(5);
      } catch (e: any) {
        alert(`Failed to apply: ${e.message}`);
      } finally {
        setIsLoading(false);
      }
    },
    [plugin, proposal, saveSession]
  );

  return (
    <div className="llm-wiki-ingest-app">
      {phase === "SELECT" && (
        <SourceSelector plugin={plugin} onSelect={handleSourceSelected} />
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
