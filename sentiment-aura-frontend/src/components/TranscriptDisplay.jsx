// src/components/TranscriptDisplay.jsx
import React, { useEffect, useRef } from "react";

/**
 * TranscriptDisplay
 *
 * Props:
 *  - transcript: string[]   // array of final transcript lines (old->new)
 *  - partial: string        // the in-progress partial line (may be "")
 *  - maxLines: number       // optional, how many final lines to keep visible
 */
export default function TranscriptDisplay({
  transcript = [],
  partial = "",
  maxLines = 200,
}) {
  const containerRef = useRef(null);
  const lastLengthRef = useRef(0);

  // Auto-scroll when transcript or partial changes and new content appended
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // If transcript length increased (new final line) or partial changed,
    // scroll to bottom for live view.
    // Use a small timeout to allow DOM paint.
    const shouldScroll =
      transcript.length !== lastLengthRef.current || partial.length > 0;

    lastLengthRef.current = transcript.length;

    if (shouldScroll) {
      // Allow frame to render
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [transcript, partial]);

  // Trim transcript to recent lines to avoid DOM growth
  const visibleTranscript =
    transcript.length > maxLines
      ? transcript.slice(transcript.length - maxLines)
      : transcript;

  return (
    <div
      ref={containerRef}
      className="transcript-container"
      style={{
        maxHeight: "46vh",
        overflowY: "auto",
        padding: "12px",
        borderRadius: 8,
        background: "rgba(0,0,0,0.35)",
        boxShadow: "inset 0 0 20px rgba(0,0,0,0.25)",
        color: "white",
        fontFamily:
          "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
        fontSize: 15,
        lineHeight: "1.45",
      }}
      aria-live="polite"
      aria-atomic="false"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visibleTranscript.map((line, idx) => (
          <div
            key={`final-${idx}-${line.slice(0, 20)}`}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
              color: "rgba(255,255,255,0.95)",
              boxShadow: "0 1px 0 rgba(255,255,255,0.02) inset",
              wordBreak: "break-word",
            }}
          >
            {line}
          </div>
        ))}

        {partial ? (
          <div
            key="partial-line"
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              background: "rgba(255,255,255,0.02)",
              color: "rgba(255,255,255,0.82)",
              fontStyle: "italic",
              opacity: 0.95,
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 999,
                background: "linear-gradient(180deg,#fff,#ddd)",
                boxShadow: "0 0 8px rgba(255,255,255,0.12)",
              }}
              aria-hidden
            />
            <span style={{ opacity: 0.98 }}>
              {partial} <span style={{ opacity: 0.7 }}>(listening…)</span>
            </span>
          </div>
        ) : (
          <div style={{ height: 6 }} /> // small spacer to keep layout smooth
        )}
      </div>
    </div>
  );
}
