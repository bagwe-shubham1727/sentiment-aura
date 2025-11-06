import React from "react";

export default function KeywordsDisplay({ keywords = [] }) {
  return (
    <div className="keywords" aria-live="polite">
      {keywords.length > 0 ? (
        keywords.map((kw, i) => {
          const delay = `${i * 80}ms`;
          return (
            <span key={i} className="keyword" style={{ animationDelay: delay }}>
              {kw}
            </span>
          );
        })
      ) : (
        <p className="text-gray-400 italic">Keywords will appear here...</p>
      )}
    </div>
  );
}
