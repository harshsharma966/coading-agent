import React from "react";
import { Bot, User } from "lucide-react";
import CodeBlock from "./CodeBlock";
import ThoughtProcess from "./ThoughtProcess";

export default function MessageRow({ sender, content, thoughts }) {
  const isUser = sender === "user";

  const renderFormattedContent = (text) => {
    if (!text) return null;

    // Split text into code blocks and normal markdown segments
    const regex = /```(\w*)\n([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Content before the code block
      if (match.index > lastIndex) {
        parts.push({
          type: "text",
          content: text.slice(lastIndex, match.index),
        });
      }

      // Code block
      parts.push({
        type: "code",
        language: match[1] || "code",
        code: match[2].trim(),
      });

      lastIndex = regex.lastIndex;
    }

    // Remaining text after last code block
    if (lastIndex < text.length) {
      parts.push({
        type: "text",
        content: text.slice(lastIndex),
      });
    }

    return parts.map((part, idx) => {
      if (part.type === "code") {
        return <CodeBlock key={idx} language={part.language} code={part.code} />;
      }

      // Format markdown text lines
      const lines = part.content.split("\n");
      return (
        <div key={idx} className="text-segment">
          {lines.map((line, lIdx) => {
            // Check headers
            if (line.startsWith("### ")) {
              return <h4 key={lIdx} style={{ margin: "10px 0 4px", fontSize: "14px", color: "#38bdf8" }}>{line.replace("### ", "")}</h4>;
            }
            if (line.startsWith("## ")) {
              return <h3 key={lIdx} style={{ margin: "12px 0 6px", fontSize: "15px", color: "#00f2fe" }}>{line.replace("## ", "")}</h3>;
            }
            if (line.startsWith("# ")) {
              return <h2 key={lIdx} style={{ margin: "14px 0 8px", fontSize: "17px", color: "#fff" }}>{line.replace("# ", "")}</h2>;
            }

            // Bullet points
            const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
            if (bulletMatch) {
              return (
                <li key={lIdx} style={{ marginLeft: "20px", marginBottom: "4px" }}>
                  {formatInline(bulletMatch[1])}
                </li>
              );
            }

            return (
              <p key={lIdx} style={{ marginBottom: line.trim() ? "6px" : "10px", minHeight: line.trim() ? "auto" : "8px" }}>
                {formatInline(line)}
              </p>
            );
          })}
        </div>
      );
    });
  };

  const formatInline = (str) => {
    if (!str) return "";
    // Handle inline code `...` and bold **...**
    const parts = str.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((seg, i) => {
      if (seg.startsWith("`") && seg.endsWith("`")) {
        return <code key={i} className="inline-code">{seg.slice(1, -1)}</code>;
      }
      if (seg.startsWith("**") && seg.endsWith("**")) {
        return <strong key={i}>{seg.slice(2, -2)}</strong>;
      }
      return seg;
    });
  };

  return (
    <div className={`message-row ${sender}`}>
      <div className="avatar">
        {isUser ? <User size={18} /> : <Bot size={19} />}
      </div>
      <div className="message-bubble">
        {thoughts && thoughts.length > 0 && (
          <ThoughtProcess thoughts={thoughts} isLive={false} />
        )}
        {renderFormattedContent(content)}
      </div>
    </div>
  );
}
