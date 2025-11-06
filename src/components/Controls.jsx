import React from "react";

export default function Controls({ isRecording, onStart, onStop }) {
  return (
    <div className="controls" role="group" aria-label="Recording controls">
      {isRecording ? (
        <button
          onClick={onStop}
          aria-pressed="true"
          className="px-4 py-2 rounded-md"
          style={{ background: "#ff4d4f", color: "#fff", fontWeight: 600 }}
        >
          ● Stop
        </button>
      ) : (
        <button
          onClick={onStart}
          aria-pressed="false"
          className="px-4 py-2 rounded-md"
          style={{ background: "#10b981", color: "#fff", fontWeight: 600 }}
        >
          ⏺ Start
        </button>
      )}
    </div>
  );
}
