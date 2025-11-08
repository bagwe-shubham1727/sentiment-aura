// src/components/KeywordsDisplay.jsx
import React, { useEffect, useState } from "react";

export default function KeywordsDisplay({ keywords = [], aura }) {
  const [displayedKeywords, setDisplayedKeywords] = useState([]);

  // Gracefully fade in keywords one by one
  useEffect(() => {
    if (!keywords || keywords.length === 0) {
      setDisplayedKeywords([]);
      return;
    }

    // Add new keywords with staggered animation
    const newKeywords = keywords.filter(
      (k) => !displayedKeywords.some((dk) => dk.text === k)
    );

    if (newKeywords.length > 0) {
      newKeywords.forEach((keyword, index) => {
        setTimeout(() => {
          setDisplayedKeywords((prev) => [
            ...prev,
            { text: keyword, id: `${keyword}-${Date.now()}-${index}` },
          ]);
        }, index * 200); // Stagger by 200ms
      });
    }

    // Remove old keywords that are no longer in the list
    const currentKeywordTexts = keywords;
    setDisplayedKeywords((prev) =>
      prev.filter((dk) => currentKeywordTexts.includes(dk.text))
    );
  }, [keywords]);

  const swatch = aura ?? {
    label: "White",
    color: "#fff",
    meaning: "Calm",
    textColor: "#000",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Keywords Tag Cloud */}
      <div>
        <div
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.7)",
            marginBottom: 10,
            fontWeight: 600,
            letterSpacing: "0.5px",
          }}
        >
          KEY TOPICS
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            minHeight: 40,
          }}
        >
          {displayedKeywords && displayedKeywords.length > 0 ? (
            displayedKeywords.map((k, i) => (
              <div
                key={k.id}
                className="keyword-tag"
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
                  animation: `fadeInUp 0.6s ease-out ${i * 0.1}s both`,
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
              Keywords will appear here...
            </div>
          )}
        </div>
      </div>

      {/* Aura Energy Card */}
      <div>
        <div
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.7)",
            marginBottom: 10,
            fontWeight: 600,
            letterSpacing: "0.5px",
          }}
        ></div>
        {/* <div
          className="aura-card"
          style={{
            padding: "16px",
            borderRadius: 16,
            background: "rgba(0,0,0,0.25)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            display: "flex",
            gap: 16,
            alignItems: "center",
            transition: "all 0.5s ease",
          }}
        >
          <div
            style={{
              minWidth: 64,
              height: 64,
              borderRadius: 16,
              background: `linear-gradient(135deg, ${swatch.color}, ${swatch.color}dd)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: swatch.textColor,
              fontWeight: 700,
              fontSize: 12,
              boxShadow: `0 0 20px ${swatch.color}44, inset 0 2px 8px rgba(255,255,255,0.1)`,
              flexShrink: 0,
              textAlign: "center",
              padding: 8,
              transition: "all 0.5s ease",
            }}
          >
            {swatch.label}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#fff",
                marginBottom: 4,
                letterSpacing: "0.5px",
              }}
            >
              {swatch.label}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.8)",
                lineHeight: 1.4,
              }}
            >
              {swatch.meaning}
            </div>
          </div>
        </div> */}
      </div>

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .keyword-tag {
          transition: all 0.3s ease;
        }

        .keyword-tag:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.3);
          background: rgba(255,255,255,0.18);
        }

        .aura-card {
          animation: slideInRight 0.6s ease-out;
        }

        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
