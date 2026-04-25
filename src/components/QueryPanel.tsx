import React, { useState } from "react";
import { ChatMessage } from "../types";
import { ChatPanel } from "./ChatPanel";

interface Props {
  initialQuery: string;
  onBack: () => void;
}

export const QueryPanel: React.FC<Props> = ({ initialQuery, onBack }) => {
  const [messages] = useState<ChatMessage[]>([
    { role: "user", content: initialQuery },
    {
      role: "assistant",
      content: "Query functionality coming soon...",
    },
  ]);

  return (
    <ChatPanel
      messages={messages}
      isLoading={false}
      onSend={() => {}}
      onBack={onBack}
      backLabel="← Back"
      phaseLabel="Query"
      placeholder="Ask your wiki..."
      inputDisabled={true}
    />
  );
};
