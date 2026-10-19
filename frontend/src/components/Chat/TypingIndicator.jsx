import React from "react";
import { Bot } from "lucide-react";
import ThoughtProcess from "./ThoughtProcess";

export default function TypingIndicator({ thoughts = [] }) {
  return (
    <div className="message-row assistant">
      <div className="avatar">
        <Bot size={19} />
      </div>
      <div className="message-bubble">
        {thoughts && thoughts.length > 0 && (
          <ThoughtProcess thoughts={thoughts} isLive={true} />
        )}
        <div className="typing-indicator">
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
        </div>
      </div>
    </div>
  );
}
