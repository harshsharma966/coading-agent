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
  const containerRef = useRef(null);
  const bottomRef = useRef(null);

  const scrollToBottom = (behavior = "smooth") => {
    // If an approval card is active, do not force-scroll to bottomRef so the card
    // stays fully visible above the floating bottom input box.
    if (activeApproval) return;

    if (containerRef.current) {
      try {
        containerRef.current.scrollTo({
          top: containerRef.current.scrollHeight,
          behavior,
        });
      } catch {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    }
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  };

  useEffect(() => {
    scrollToBottom("auto");
    const t1 = setTimeout(() => scrollToBottom("smooth"), 60);
    const t2 = setTimeout(() => scrollToBottom("smooth"), 220);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [messages, streamingContent, isStreaming, activeThoughts, activeApproval]);

  return (
    <div className="messages-container" ref={containerRef}>
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
