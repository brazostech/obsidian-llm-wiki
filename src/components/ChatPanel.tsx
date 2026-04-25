import React, { useState, useRef, useEffect } from "react";
import { ChatMessage } from "../types";
import { MarkdownMessage } from "./MarkdownMessage";

const PROPOSAL_PHRASES = [
  "Generating proposal",
  "Thinking about structure",
  "Drafting wiki pages",
  "Preparing checklist",
];

export const AnimatedProposingStatus: React.FC = () => {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const dotInterval = setInterval(() => {
      setDots((d) => (d + 1) % 4);
    }, 600);

    const phraseInterval = setInterval(() => {
      setPhraseIndex((i) => (i + 1) % PROPOSAL_PHRASES.length);
      setDots(0);
    }, 2800);

    return () => {
      clearInterval(dotInterval);
      clearInterval(phraseInterval);
    };
  }, []);

  const phrase = PROPOSAL_PHRASES[phraseIndex];
  const suffix = ".".repeat(dots);

  return (
    <div className="llm-wiki-proposing-status">
      <span className="llm-wiki-spinner" />
      <span className="llm-wiki-proposing-text">
        {phrase}{suffix}
      </span>
    </div>
  );
};

export interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (text: string) => void;
  onBack: () => void;
  backLabel?: string;
  phaseLabel?: string;
  placeholder?: string;
  inputDisabled?: boolean;
  actions?: React.ReactNode;
  statusOverlay?: React.ReactNode;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isLoading,
  onSend,
  onBack,
  backLabel = "← Back",
  phaseLabel = "Discussion",
  placeholder = "Your commentary...",
  inputDisabled = false,
  actions,
  statusOverlay,
}) => {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || inputDisabled) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="llm-wiki-chat-panel">
      <div className="llm-wiki-chat-header">
        <button
          className="llm-wiki-back-btn"
          type="button"
          onClick={onBack}
          disabled={isLoading}
        >
          {backLabel}
        </button>
        <span className="llm-wiki-phase-label">{phaseLabel}</span>
      </div>
      <div className="llm-wiki-chat-messages" ref={scrollRef}>
        {messages.map((m, i) => (
          <div
            key={i}
            className={`llm-wiki-message llm-wiki-message-${m.role}`}
          >
            {m.role === "assistant" ? (
              <MarkdownMessage content={m.content} />
            ) : (
              <div className="llm-wiki-message-content">{m.content}</div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="llm-wiki-message llm-wiki-message-assistant llm-wiki-loading">
            <div className="llm-wiki-message-content">
              <span className="llm-wiki-spinner"></span>
              Thinking...
            </div>
          </div>
        )}
      </div>
      {statusOverlay ? (
        <div className="llm-wiki-chat-input llm-wiki-chat-input-proposing">
          {statusOverlay}
        </div>
      ) : (
        <form className="llm-wiki-chat-input" onSubmit={handleSubmit}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            rows={3}
            disabled={inputDisabled}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <div className="llm-wiki-chat-actions">
            <button type="submit" disabled={isLoading || !input.trim() || inputDisabled}>
              Send
            </button>
            {actions}
          </div>
        </form>
      )}
    </div>
  );
};
