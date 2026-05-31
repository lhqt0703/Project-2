import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import "./GridMotionOverlay.css";

// Dynamically load all role card portraits starting with 'F ' and ending with '.avif'
const roleImagesMap = import.meta.glob<string>("../assets/F *.avif", { eager: true, import: "default" });
const roleImages = Object.values(roleImagesMap);

interface GridMotionOverlayProps {
  active: boolean;
  onComplete: () => void;
}

export default function GridMotionOverlay({ active, onComplete }: GridMotionOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [grid, setGrid] = useState<string[][]>([]);

  // Generate grid layout with non-repeating adjacent cells
  useEffect(() => {
    if (!active || roleImages.length === 0) return;

    const rows = 4;
    const cols = 9;
    const tempGrid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(""));

    // Check all 8 directions for duplicates (horizontal, vertical, diagonal)
    function getNeighbors(r: number, c: number): string[] {
      const list: string[] = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            if (tempGrid[nr][nc]) {
              list.push(tempGrid[nr][nc]);
            }
          }
        }
      }
      return list;
    }

    // Backtracking solver
    function solve(r: number, c: number): boolean {
      if (r === rows) return true;
      const nextR = c === cols - 1 ? r + 1 : r;
      const nextC = c === cols - 1 ? 0 : c + 1;

      // Shuffle images array to get randomized choices
      const shuffled = [...roleImages].sort(() => Math.random() - 0.5);
      const neighbors = getNeighbors(r, c);

      for (const img of shuffled) {
        if (!neighbors.includes(img)) {
          tempGrid[r][c] = img;
          if (solve(nextR, nextC)) return true;
          tempGrid[r][c] = ""; // backtrack
        }
      }
      return false;
    }

    const success = solve(0, 0);
    if (success) {
      setGrid(tempGrid);
    } else {
      // Fallback in case of failures (practically impossible due to sparse constraints)
      const fallbackGrid = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => roleImages[Math.floor(Math.random() * roleImages.length)])
      );
      setGrid(fallbackGrid);
    }
  }, [active]);

  // GSAP animation logic
  useEffect(() => {
    if (!active || grid.length === 0) return;

    const overlay = containerRef.current;
    const intro = introRef.current;
    const rows = rowRefs.current;

    if (!overlay || !intro) return;

    // Reset initial styles
    gsap.set(overlay, { display: "flex", opacity: 1 });
    gsap.set(intro, { opacity: 0 });

    const tl = gsap.timeline({
      onComplete: () => {
        onComplete();
      },
    });

    // 1. Fade in the background overlay cover
    tl.to(intro, {
      opacity: 1,
      duration: 0.8,
      ease: "power2.out",
    });

    // 2. Start rows sliding in from two sides
    tl.addLabel("gridStart", 0.4);

    rows.forEach((row, index) => {
      if (!row) return;
      
      // Row 1 & 3: Left to Right
      // Row 2 & 4: Right to Left
      const isOdd = index % 2 === 0;
      const startX = isOdd ? "-290vw" : "290vw";
      const endX = isOdd ? "290vw" : "-290vw";

      tl.fromTo(
        row,
        { x: startX },
        {
          x: endX,
          duration: 2.8,
          ease: "power1.out",
        },
        `gridStart+=${index * 0.2}`
      );
    });

    // 3. Fade out the background overlay to transition back to the game page
    // The last row starts at 0.4 + 0.6 = 1.0s and takes 3.8s, ending at 4.8s.
    // We start fading out the background at 4.9s.
    tl.to(
      intro,
      {
        opacity: 0,
        duration: 0.8,
        ease: "power3.out",
      },
      "2.9"
    );

    // 4. Hide the overlay container
    tl.set(overlay, { display: "none" });

    return () => {
      tl.kill();
    };
  }, [active, grid]);

  if (!active || grid.length === 0) return null;

  return (
    <div className="grid-motion-overlay" ref={containerRef}>
      <section
        className="intro"
        ref={introRef}
        style={{
          background: `radial-gradient(circle, rgba(22, 10, 38, 0.98) 0%, rgba(4, 1, 9, 0.99) 100%)`,
        }}
      >
        <div className="gridMotion-container">
          {grid.map((row, rowIndex) => (
            <div
              key={rowIndex}
              className="row"
              ref={(el) => {
                rowRefs.current[rowIndex] = el;
              }}
            >
              {row.map((content, itemIndex) => (
                <div key={itemIndex} className="row__item">
                  <div className="row__item-inner">
                    <div
                      className="row__item-img"
                      style={{
                        backgroundImage: `url(${content})`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
