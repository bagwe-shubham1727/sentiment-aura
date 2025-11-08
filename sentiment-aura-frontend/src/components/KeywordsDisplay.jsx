// src/components/KeywordsDisplay.jsx
import React from "react";

/**
 * KeywordsDisplay
 * Props:
 *  - keywords: string[]
 *  - sentiment: number (0..1)
 */
export default function KeywordsDisplay({ keywords = [], aura }) {
  const swatch = aura ?? {
    label: "White",
    color: "#fff",
    meaning: "Calm",
    textColor: "#000",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {keywords && keywords.length > 0 ? (
          keywords.map((k, i) => (
            <div
              key={i}
              style={{
                background: "rgba(0,0,0,0.18)",
                color: "#fff",
                padding: "6px 12px",
                borderRadius: 20,
                fontSize: 14,
                boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
                maxWidth: 240,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {k}
            </div>
          ))
        ) : (
          <div style={{ color: "rgba(255,255,255,0.75)" }}>
            Keywords will appear here...
          </div>
        )}
      </div>
      <div style={{ color: "rgba(255,255,255,0.75)" }}>Aura Energy</div>
      <div
        className="aura-meaning"
        style={{
          marginTop: 6,
          padding: "12px 14px",
          borderRadius: 12,
          display: "flex",
          gap: 12,
          alignItems: "center",
          background: "rgba(0,0,0,0.28)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          minWidth: 0,
        }}
      >
        <div
          style={{
            minWidth: 56,
            height: 56,
            borderRadius: 12,
            background: aura.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: aura.textColor,
            fontWeight: 700,
            boxShadow: "inset 0 2px 8px rgba(255,255,255,0.05)",
            flexShrink: 0,
            padding: 8,
            textAlign: "center",
            fontSize: 13,
          }}
        >
          {swatch.label}
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#fff",
              lineHeight: 1.05,
            }}
          >
            {swatch.label}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.9)",
              marginTop: 4,
              wordBreak: "break-word",
            }}
          >
            {swatch.meaning}
          </div>
        </div>
      </div>
    </div>
  );
}
