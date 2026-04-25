import React, { useState, useCallback, useRef } from "react";
import LlmWikiPlugin from "../main";
import { IngestPhase, ChatMessage } from "../types";
import { SourceSelector } from "./SourceSelector";
import { ChatPanel } from "./ChatPanel";
import { ProposalChecklist } from "./ProposalChecklist";
import { chatResponse, generateGreeting } from "../ai/chat";
import { generateProposal, Proposal } from "../ai/propose";
import { WikiReader } from "../wiki/reader";
import { WikiWriter } from "../wiki/writer";

interface Props {
  plugin: LlmWikiPlugin;
}

export const IngestApp: React.FC<Props> = ({ plugin }) => {
  const [phase, setPhase] = useState<IngestPhase>("SELECT");
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [sourceContent, setSourceContent] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProposing, setIsProposing] = useState(false);
  const messagesRef = useRef<ChatMessage[]>([]);

  const handleBackToSelect = useCallback(() => {
    setPhase("SELECT");
    setSourcePath(null);
    setSourceContent("");
    setMessages([]);
    messagesRef.current = [];
    setIsLoading(false);
  }, []);

  const handleSourceSelected = useCallback(
    async (path: string, content: string) => {
      setSourcePath(path);
      setSourceContent(content);
      setPhase("CHAT");

      // Generate an opening greeting to welcome the user into the conversation
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
    [plugin]
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
        // Build LLM messages: source context first, then conversation history
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
      // Build LLM messages with source context included
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
      } catch (e: any) {
        alert(`Failed to apply: ${e.message}`);
      } finally {
        setIsLoading(false);
      }
    },
    [plugin, proposal]
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
          isProposing={isProposing}
          onSend={handleSendMessage}
          onCommit={handleCommit}
          onBack={handleBackToSelect}
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
