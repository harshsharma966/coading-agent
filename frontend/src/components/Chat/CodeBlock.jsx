import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

export default function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-header">
        <span>{language || "code"}</span>
        <button className="copy-btn" onClick={handleCopy} title="Copy code">
          {copied ? (
            <>
              <Check size={13} style={{ color: "#10b981" }} />
              <span style={{ color: "#10b981" }}>Copied!</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
