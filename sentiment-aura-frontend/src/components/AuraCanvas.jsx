// src/components/AuraCanvas.jsx
import React, { useEffect, useRef } from "react";
import p5 from "p5";

export default function AuraCanvas({ sentiment = 0.5 }) {
  const containerRef = useRef(null);
  const p5InstanceRef = useRef(null);

  useEffect(() => {
    // p5 sketch function
    const sketch = (p) => {
      let t = 0;

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);
        p.noStroke();
        p.colorMode(p.HSB);
        // initialize instance fields
        p._sentiment = sentiment;
        p._smoothed = sentiment;
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
      };

      p.draw = () => {
        // read target sentiment (may be updated from React via p._sentiment)
        const target = typeof p._sentiment === "number" ? p._sentiment : 0.5;

        // smooth toward target on the sketch side for frame-to-frame continuity
        p._smoothed = p.lerp(p._smoothed ?? target, target, 0.06);

        // map smoothed sentiment to visual params
        const s = p._smoothed;
        const hue = p.map(s, 0, 1, 0, 140); // 0=red -> 140=greenish
        const energy = p.map(s, 0, 1, 0.35, 1.6);

        p.clear();
        // subtle background wash (low alpha)
        p.background(hue, 40, 10, 0.12);

        // resolution scales with width/height to keep perf reasonable
        const base = Math.max(24, Math.floor((p.width * p.height) / 20000));
        const cols = Math.max(24, Math.floor(p.width / Math.sqrt(base)));
        const rows = Math.max(16, Math.floor(p.height / Math.sqrt(base)));
        const spacingX = p.width / cols;
        const spacingY = p.height / rows;

        // draw perlin-noise influenced blobs
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const nx = x / cols;
            const ny = y / rows;
            // vary noise frequency a bit with time and location
            const n = p.noise(nx * 2.0 + t * 0.08, ny * 2.2 - t * 0.04);
            const px = x * spacingX + spacingX * 0.5;
            const py = y * spacingY + spacingY * 0.5;
            const radius = Math.max(2, Math.pow(n, 1.5) * 80 * energy);
            p.fill((hue + n * 30) % 360, 80, 85, 0.06 + n * 0.14);
            p.circle(px, py, radius);
          }
        }

        // subtle moving highlights
        for (let i = 0; i < 10 * energy; i++) {
          const nx = p.noise(i * 0.3 - t * 0.02, t * 0.01);
          const x = p.noise(nx, t * 0.005) * p.width;
          const y = p.noise(nx + 10, t * 0.006) * p.height;
          p.fill((hue + i * 10) % 360, 80, 95, 0.035);
          p.circle(x, y, 6 + 30 * energy * p.noise(i * 0.1 + t * 0.02));
        }

        // advance time scaled by energy
        t += 0.004 + energy * 0.003;
      };
    };

    // create and attach the p5 instance
    p5InstanceRef.current = new p5(sketch, containerRef.current);

    // cleanup on unmount
    return () => {
      if (p5InstanceRef.current) {
        p5InstanceRef.current.remove();
        p5InstanceRef.current = null;
      }
    };
    // mount only once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // update the p5 instance sentiment value whenever the prop changes
  useEffect(() => {
    if (p5InstanceRef.current) {
      p5InstanceRef.current._sentiment = Math.max(0, Math.min(1, sentiment));
    }
  }, [sentiment]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none", // ensure UI remains interactive
      }}
      aria-hidden="true"
    />
  );
}
