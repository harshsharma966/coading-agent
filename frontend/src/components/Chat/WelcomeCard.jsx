import React from "react";
import { Search, FileText, Code2 } from "lucide-react";

export default function WelcomeCard({ onSelectPrompt }) {
  const prompts = [
    {
      id: "search",
      icon: <Search size={14} />,
      text: "Search codebase",
    },
    {
      id: "pdf",
      icon: <FileText size={14} />,
      text: "Analyze PDF",
    },
    {
      id: "explain",
      icon: <Code2 size={14} />,
      text: "Explain code",
    },
  ];

  return (
    <div className="welcome-section">
      <div className="welcome-greeting">
        <h2>What are we building today?</h2>
        <p>Ask questions, explore your codebase, or analyze documents.</p>
      </div>

      <div className="quick-prompts">
        {prompts.map((p) => (
          <button
            key={p.id}
            className="prompt-chip"
            onClick={() => onSelectPrompt(p.id)}
            title={`Click to ${p.text.toLowerCase()}`}
          >
            {p.icon}
            <span>{p.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
