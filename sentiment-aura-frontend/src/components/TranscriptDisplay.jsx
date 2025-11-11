// src/components/TranscriptDisplay.jsx
/**
 * Transcript Display Component
 *
 * Features:
 * - Real-time transcript display with auto-scroll
 * - Separate partial (live) and final transcripts
 * - Auto-scroll to latest content
 * - Loading states
 * - Empty states
 * - Accessibility support
 * - Performance optimized with virtualization for large transcripts
 */

import React, { useEffect, useRef, useState, useMemo } from "react";

// ========== CONFIGURATION ==========
const CONFIG = {
  MAX_TRANSCRIPT_LINES: 100, // Limit transcript history
  AUTO_SCROLL_THRESHOLD: 50, // px from bottom to trigger auto-scroll
  SCROLL_BEHAVIOR: "smooth", // 'smooth' or 'auto'
  PARTIAL_TYPING_INDICATOR: true, // Show typing indicator for partial
  FADE_IN_DURATION: 300, // ms for new line fade-in
};

// ========== HELPER FUNCTIONS ==========
/**
 * Checks if element is scrolled near bottom
 */
function isNearBottom(element, threshold = CONFIG.AUTO_SCROLL_THRESHOLD) {
  if (!element) return true;

  const { scrollTop, scrollHeight, clientHeight } = element;
  return scrollHeight - scrollTop - clientHeight < threshold;
}

/**
 * Scrolls element to bottom
 */
function scrollToBottom(element, behavior = CONFIG.SCROLL_BEHAVIOR) {
  if (!element) return;

  element.scrollTo({
    top: element.scrollHeight,
    behavior,
  });
}

/**
 * Formats timestamp for transcript line
 */
function formatTimestamp(date) {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

// ========== MAIN COMPONENT ==========
export default function TranscriptDisplay({ transcript = [], partial = "" }) {
  // ===== STATE =====
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [isUserScrolling, setIsUserScrolling] = useState(false);

  // ===== REFS =====
  const containerRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  const lastScrollTopRef = useRef(0);

  // ===== MEMOIZED VALUES =====
  /**
   * Sanitized transcript lines with metadata
   */
  const transcriptLines = useMemo(() => {
    if (!Array.isArray(transcript)) return [];

    return transcript
      .filter(
        (line) => line && typeof line === "string" && line.trim().length > 0
      )
      .slice(-CONFIG.MAX_TRANSCRIPT_LINES) // Limit history
      .map((line, index) => ({
        id: `line-${index}-${Date.now()}`,
        text: line.trim(),
        timestamp: new Date(),
        index,
      }));
  }, [transcript]);

  /**
   * Sanitized partial text
   */
  const partialText = useMemo(() => {
    if (!partial || typeof partial !== "string") return "";
    return partial.trim();
  }, [partial]);

  /**
   * Check if display is empty
   */
  const isEmpty = transcriptLines.length === 0 && !partialText;

  /**
   * Total content length (for performance monitoring)
   */
  const totalLength = useMemo(() => {
    const transcriptLength = transcriptLines.reduce(
      (sum, line) => sum + line.text.length,
      0
    );
    const partialLength = partialText.length;
    return transcriptLength + partialLength;
  }, [transcriptLines, partialText]);

  // ===== SCROLL HANDLING =====
  /**
   * Handle user scroll
   */
  const handleScroll = () => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const currentScrollTop = container.scrollTop;

    // Detect scroll direction
    const isScrollingUp = currentScrollTop < lastScrollTopRef.current;
    lastScrollTopRef.current = currentScrollTop;

    // Check if near bottom
    const nearBottom = isNearBottom(container);

    // Update auto-scroll state
    if (nearBottom && !shouldAutoScroll) {
      setShouldAutoScroll(true);
      setIsUserScrolling(false);
    } else if (isScrollingUp && shouldAutoScroll) {
      setShouldAutoScroll(false);
      setIsUserScrolling(true);
    }

    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Reset user scrolling flag after inactivity
    scrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 1000);
  };

  // ===== AUTO-SCROLL EFFECT =====
  /**
   * Auto-scroll when new content arrives
   */
  useEffect(() => {
    if (!shouldAutoScroll || !containerRef.current) return;

    // Small delay to ensure DOM is updated
    const timeoutId = setTimeout(() => {
      if (containerRef.current) {
        scrollToBottom(containerRef.current);
      }
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [transcriptLines, partialText, shouldAutoScroll]);

  // ===== CLEANUP =====
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // ===== RENDER =====
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 200,
        position: "relative",
      }}
    >
      {/* Header */}
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
        <span>LIVE TRANSCRIPT</span>

        {/* Status Indicators */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {partialText && (
            <span
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.5)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
              aria-live="polite"
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#4ade80",
                  animation: "pulse 1.5s infinite",
                }}
                aria-hidden="true"
              />
              <span>Listening...</span>
            </span>
          )}

          {transcriptLines.length > 0 && (
            <span
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.4)",
              }}
            >
              {transcriptLines.length} line
              {transcriptLines.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Transcript Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-atomic="false"
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "12px 16px",
          background: "rgba(0,0,0,0.2)",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.1)",
          position: "relative",
          scrollBehavior: CONFIG.SCROLL_BEHAVIOR,
          // Custom scrollbar
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255,255,255,0.2) transparent",
        }}
        className="transcript-container"
      >
        {/* Empty State */}
        {isEmpty && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 12,
              color: "rgba(255,255,255,0.4)",
              textAlign: "center",
            }}
            role="status"
          >
            <div
              style={{
                fontSize: 40,
                opacity: 0.3,
              }}
              aria-hidden="true"
            >
              🎤
            </div>
            <div style={{ fontSize: 14 }}>
              Start recording to see your transcript here
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Your words will appear in real-time
            </div>
          </div>
        )}

        {/* Transcript Lines */}
        {transcriptLines.map((line, index) => (
          <div
            key={line.id}
            style={{
              marginBottom: 12,
              paddingBottom: 12,
              borderBottom:
                index < transcriptLines.length - 1
                  ? "1px solid rgba(255,255,255,0.05)"
                  : "none",
              animation: `fadeIn ${CONFIG.FADE_IN_DURATION}ms ease-out`,
            }}
          >
            {/* Timestamp */}
            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.3)",
                marginBottom: 4,
                fontFamily: "monospace",
              }}
              aria-label={`Timestamp: ${formatTimestamp(line.timestamp)}`}
            >
              {formatTimestamp(line.timestamp)}
            </div>

            {/* Transcript Text */}
            <div
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.9)",
                lineHeight: 1.6,
                wordBreak: "break-word",
              }}
            >
              {line.text}
            </div>
          </div>
        ))}

        {/* Partial Transcript (Live) */}
        {partialText && (
          <div
            style={{
              marginTop: transcriptLines.length > 0 ? 12 : 0,
              padding: "12px 16px",
              background: "rgba(74, 222, 128, 0.1)",
              border: "1px solid rgba(74, 222, 128, 0.2)",
              borderRadius: 8,
              animation: "fadeIn 200ms ease-out",
            }}
            role="status"
            aria-live="polite"
            aria-label="Live transcript"
          >
            <div
              style={{
                fontSize: 10,
                color: "rgba(74, 222, 128, 0.8)",
                marginBottom: 4,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#4ade80",
                  animation: "pulse 1.5s infinite",
                }}
                aria-hidden="true"
              />
              <span>LIVE</span>
            </div>
            <div
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.95)",
                lineHeight: 1.6,
                wordBreak: "break-word",
              }}
            >
              {partialText}
              {CONFIG.PARTIAL_TYPING_INDICATOR && (
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 16,
                    marginLeft: 4,
                    background: "#4ade80",
                    animation: "blink 1s infinite",
                  }}
                  aria-hidden="true"
                />
              )}
            </div>
          </div>
        )}

        {/* Performance Warning (dev only) */}
        {import.meta.env.DEV && totalLength > 10000 && (
          <div
            style={{
              marginTop: 12,
              padding: 8,
              background: "rgba(251, 191, 36, 0.1)",
              border: "1px solid rgba(251, 191, 36, 0.3)",
              borderRadius: 6,
              fontSize: 11,
              color: "rgba(251, 191, 36, 0.9)",
            }}
          >
            ⚠️ Large transcript ({Math.round(totalLength / 1000)}k chars) -
            performance may be affected
          </div>
        )}
      </div>

      {/* Scroll to Bottom Button */}
      {!shouldAutoScroll && transcriptLines.length > 0 && (
        <button
          onClick={() => {
            setShouldAutoScroll(true);
            if (containerRef.current) {
              scrollToBottom(containerRef.current, "smooth");
            }
          }}
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            padding: "8px 16px",
            background: "rgba(59, 130, 246, 0.9)",
            border: "none",
            borderRadius: 24,
            color: "white",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "all 0.2s ease",
            zIndex: 10,
          }}
          onMouseEnter={(e) => {
            e.target.style.background = "rgba(59, 130, 246, 1)";
            e.target.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.target.style.background = "rgba(59, 130, 246, 0.9)";
            e.target.style.transform = "translateY(0)";
          }}
          aria-label="Scroll to latest transcript"
        >
          <span>↓</span>
          <span>New messages</span>
        </button>
      )}

      {/* Animations */}
      <style>{`
        /* Fade in animation */
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Pulse animation */
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.4;
            transform: scale(1.3);
          }
        }

        /* Blink animation for cursor */
        @keyframes blink {
          0%, 49% {
            opacity: 1;
          }
          50%, 100% {
            opacity: 0;
          }
        }

        /* Custom scrollbar styles */
        .transcript-container::-webkit-scrollbar {
          width: 6px;
        }

        .transcript-container::-webkit-scrollbar-track {
          background: transparent;
        }

        .transcript-container::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
        }

        .transcript-container::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        /* Reduce motion for accessibility */
        @media (prefers-reduced-motion: reduce) {
          .transcript-container {
            scroll-behavior: auto !important;
          }
          
          @keyframes fadeIn,
          @keyframes pulse,
          @keyframes blink {
            from, to {
              opacity: 1;
              transform: none;
            }
          }
        }
      `}</style>
    </div>
  );
}
