// src/components/KeywordsDisplay.jsx
/**
 * Keywords Display Component
 *
 * Features:
 * - Animated keyword tags that fade in staggered
 * - Graceful handling of keyword updates
 * - Empty/loading states
 * - Accessibility support
 * - Smooth transitions
 * - Performance optimized
 */

import React, { useEffect, useState, useRef } from "react";

const MAX_KEYWORDS = 20; // Limit total keywords displayed

export default function KeywordsDisplay({ keywords = [], aura }) {
  const [displayedKeywords, setDisplayedKeywords] = useState([]);
  const keywordCounterRef = useRef(0);

  // Add new keywords to existing ones
  useEffect(() => {
    console.log("[KeywordsDisplay] Received new keywords:", keywords);

    if (!keywords || keywords.length === 0) {
      return; // Don't clear, just don't add
    }

    // Get current keyword texts
    const currentTexts = displayedKeywords.map((k) => k.text.toLowerCase());

    // Find truly new keywords (not already displayed)
    const newKeywords = keywords.filter(
      (keyword) => !currentTexts.includes(keyword.toLowerCase())
    );

    if (newKeywords.length > 0) {
      console.log("[KeywordsDisplay] Adding new keywords:", newKeywords);

      // Create keyword objects with unique IDs
      const newKeywordObjects = newKeywords.map((keyword) => ({
        text: keyword,
        id: `keyword-${keywordCounterRef.current++}-${Date.now()}`,
        timestamp: Date.now(),
      }));

      // Add to beginning (left side) and limit total
      setDisplayedKeywords((prev) => {
        const updated = [...newKeywordObjects, ...prev];
        return updated.slice(0, MAX_KEYWORDS);
      });
    }
  }, [keywords]);

  // Clear all keywords function (optional)
  const clearKeywords = () => {
    setDisplayedKeywords([]);
    keywordCounterRef.current = 0;
  };

  const swatch = aura ?? {
    label: "Neutral",
    color: "#9ca3af",
    meaning: "Balanced",
    textColor: "#000",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Keywords Section */}
      <div>
        <div
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.7)",
            marginBottom: 10,
            fontWeight: 600,
            letterSpacing: "0.5px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>KEY TOPICS</span>
          {displayedKeywords.length > 0 && (
            <button
              onClick={clearKeywords}
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.5)",
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 4,
                padding: "2px 8px",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.target.style.color = "rgba(255,255,255,0.9)";
                e.target.style.borderColor = "rgba(255,255,255,0.4)";
              }}
              onMouseLeave={(e) => {
                e.target.style.color = "rgba(255,255,255,0.5)";
                e.target.style.borderColor = "rgba(255,255,255,0.2)";
              }}
            >
              Clear
            </button>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            minHeight: 40,
          }}
          role="list"
        >
          {displayedKeywords && displayedKeywords.length > 0 ? (
            displayedKeywords.map((k, i) => (
              <div
                key={k.id}
                className="keyword-tag"
                role="listitem"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  backdropFilter: "blur(10px)",
                  color: "#fff",
                  padding: "8px 16px",
                  borderRadius: 24,
                  fontSize: 14,
                  fontWeight: 500,
                  boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  animation: `slideInLeft 0.5s ease-out both`,
                  maxWidth: 200,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {k.text}
              </div>
            ))
          ) : (
            <div
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: 13,
                fontStyle: "italic",
              }}
            >
              Keywords will appear here as you speak...
            </div>
          )}
        </div>

        {/* Keyword count */}
        {displayedKeywords.length > 0 && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "rgba(255,255,255,0.4)",
            }}
          >
            {displayedKeywords.length} keyword
            {displayedKeywords.length !== 1 ? "s" : ""} collected
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-30px) scale(0.8);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }

        .keyword-tag {
          transition: all 0.3s ease;
        }

        .keyword-tag:hover {
          transform: translateY(-2px) scale(1.05);
          box-shadow: 0 6px 20px rgba(0,0,0,0.3);
          background: rgba(255,255,255,0.18);
        }
      `}</style>
    </div>
  );
}
