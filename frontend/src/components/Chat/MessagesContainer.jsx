import React, { useEffect, useRef } from "react";
import MessageRow from "./MessageRow";
import WelcomeCard from "./WelcomeCard";
import TypingIndicator from "./TypingIndicator";
import ApprovalCard from "./ApprovalCard";

export default function MessagesContainer({
  messages,
  isStreaming,
  streamingContent,
  activeThoughts,
  activeApproval,
  onApprovalDecision,
  onSelectPrompt,
  userName,
  greeting,
}) {
  const bottomRef = useRef(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, isStreaming, activeThoughts, activeApproval]);

  return (
    <div className="messages-container">
      {messages.length === 0 && !isStreaming && !activeApproval && (
        <WelcomeCard
          onSelectPrompt={onSelectPrompt}
          userName={userName}
          greeting={greeting}
        />
      )}

      {messages.map((msg, index) => (
        <MessageRow
          key={msg.id || index}
          sender={msg.sender}
          content={msg.content}
          thoughts={msg.thoughts}
        />
      ))}

      {activeApproval && (
        <ApprovalCard
          approvalData={activeApproval}
          onDecision={onApprovalDecision}
        />
      )}

      {isStreaming && !activeApproval && (
        <>
          {streamingContent ? (
            <MessageRow
              sender="assistant"
              content={streamingContent}
              thoughts={activeThoughts}
            />
          ) : (
            <TypingIndicator thoughts={activeThoughts} />
          )}
        </>
      )}

      <div ref={bottomRef} style={{ height: "1px" }} />
    </div>
  );
}
