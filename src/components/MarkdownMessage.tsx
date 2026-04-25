import React, { useRef, useEffect } from "react";
import { MarkdownRenderer, Component } from "obsidian";

interface Props {
  content: string;
}

export const MarkdownMessage: React.FC<Props> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const el = containerRef.current;
    el.empty();

    const component = new Component();
    component.load();

    MarkdownRenderer.renderMarkdown(content, el, "", component).catch(
      (err) => {
        console.error("[LLM Wiki] Markdown render failed:", err);
        el.setText(content);
      }
    );

    return () => {
      component.unload();
    };
  }, [content]);

  return (
    <div
      ref={containerRef}
      className="llm-wiki-message-markdown"
    />
  );
};
