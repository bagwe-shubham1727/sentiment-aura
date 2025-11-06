import React, { useEffect, useRef } from "react";

export default function TranscriptDisplay({ transcript }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [transcript]);

  return (
    <div
      ref={ref}
      className="transcript"
      role="region"
      aria-label="Live transcript"
    >
      {transcript.length > 0 ? (
        transcript.map((line, i) => (
          <p key={i} className="text-sm text-gray-200 mb-1">
            {line}
          </p>
        ))
      ) : (
        <p className="text-gray-400 italic">Your words will appear here...</p>
      )}
    </div>
  );
}
