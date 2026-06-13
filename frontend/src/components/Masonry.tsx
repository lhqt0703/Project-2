import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import nenLungAsset from "../assets/nền lưng.avif";
import "./Masonry.css";



const useMeasure = <T extends HTMLElement>() => {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  return [ref, size] as const;
};

interface MasonryItem {
  id: string;
  img: string;
  height: number;
  roleName: string;
}

interface GridItem extends MasonryItem {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface MasonryProps {
  items: MasonryItem[];
  duskCardSelections: Record<string, number>;
  clientId: string;
  onSelectCard: (index: number) => void;
  onSelectionComplete: () => void;
  skipExitAnimation?: boolean;
}

const Masonry: React.FC<MasonryProps> = ({
  items,
  duskCardSelections,
  clientId,
  onSelectCard,
  onSelectionComplete,
  skipExitAnimation = false,
}) => {
  const [containerRef, { width }] = useMeasure<HTMLDivElement>();
  const [localSelectedCard, setLocalSelectedCard] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [animatingOut, setAnimatingOut] = useState(false);
  const hasMounted = useRef(false);

  const startY = useMemo(() => {
    return (typeof window !== "undefined" ? window.innerHeight : 800) + 500;
  }, []);

  // Sync with server selection if any
  const serverSelectedCard = useMemo(() => {
    return Object.entries(duskCardSelections).find(([pid]) => pid === clientId)?.[1] ?? null;
  }, [duskCardSelections, clientId]);

  const selectedIndex = localSelectedCard !== null ? localSelectedCard : serverSelectedCard;
  const hasSelectedAny = selectedIndex !== null;

  // Calculate masonry grid positions and dynamic card heights
  const { grid, gridHeight } = useMemo(() => {
    if (!width) return { grid: [], gridHeight: 0 };

    const aspect = 1.5; // sửa tỷ lệ chiều rộng/chiều cao của thẻ bài để tối ưu hóa không gian và tránh quá cao trên điện thoại
    const maxGridHeight = Math.max(300, window.innerHeight * 0.55);
    const gap = 12; // horizontal & vertical gap between cards
    const minCardWidth = 60; // 90 / 1.5
    const maxAllowedCardWidth = 140;

    // Try column counts from 3 to 8 depending on screen size
    const minCols = width < 500 ? 3 : 4;
    const maxCols = width < 500 ? 6 : 8;

    let bestColumns = 4;
    let bestCardWidth = 60;
    let bestCardHeight = 90;
    let bestScore = -1;

    for (let c = minCols; c <= maxCols; c++) {
      const r = Math.ceil(items.length / c);
      
      // Chiều rộng thẻ khả thi sau khi trừ khoảng cách (gap)
      let wVal = (width - (c - 1) * gap) / c;
      
      // Chiều rộng thẻ bị giới hạn bởi chiều cao tối đa
      const hMax = (maxGridHeight - (r - 1) * gap) / r;
      const wMaxHeight = hMax / aspect;
      
      let wFit = Math.min(wVal, wMaxHeight);
      
      // Nếu việc ép vừa chiều cao làm thẻ quá nhỏ, ưu tiên giữ chiều rộng tối thiểu và cho phép cuộn dọc
      if (wFit < minCardWidth && wVal >= minCardWidth) {
        wFit = minCardWidth;
      }
      
      // Giới hạn chiều rộng tối đa
      if (wFit > maxAllowedCardWidth) {
        wFit = maxAllowedCardWidth;
      }
      
      // Điều kiện hợp lệ: không nhỏ hơn minCardWidth và không tràn chiều rộng hàng
      if (wFit >= minCardWidth && wFit <= wVal) {
        // Ưu tiên chọn kích thước thẻ lớn hơn, nếu bằng nhau thì ưu tiên chia nhiều cột hơn để tiết kiệm chiều cao
        if (wFit >= bestScore) {
          bestScore = wFit;
          bestColumns = c;
          bestCardWidth = wFit;
          bestCardHeight = wFit * aspect;
        }
      }
    }

    // Dự phòng trường hợp màn hình quá nhỏ không xếp nổi
    if (bestScore === -1) {
      bestColumns = minCols;
      bestCardWidth = minCardWidth;
      bestCardHeight = minCardWidth * aspect;
    }

    const optimalCols = bestColumns;
    const cardWidth = bestCardWidth;
    const cardHeight = bestCardHeight;

    // Center grid in container
    const totalGridWidth = (cardWidth + gap) * optimalCols - gap;
    const xOffset = Math.max(0, (width - totalGridWidth) / 2);

    const colHeights = new Array(optimalCols).fill(0);
    const grid: GridItem[] = items.map((child) => {
      const col = colHeights.indexOf(Math.min(...colHeights));
      const x = xOffset + (cardWidth + gap) * col;
      const y = colHeights[col];

      colHeights[col] += cardHeight + gap;

      return { ...child, x, y, w: cardWidth, h: cardHeight };
    });

    const calculatedGridHeight = Math.max(0, Math.max(...colHeights) - gap);

    return { grid, gridHeight: calculatedGridHeight };
  }, [items, width]);

  // Entrance animation
  useLayoutEffect(() => {
    if (grid.length === 0 || hasMounted.current) return;

    gsap.fromTo(
      ".masonry-item-wrapper",
      {
        opacity: 0,
        y: startY,
      },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: "power3.out",
        stagger: {
          each: 0.04,
          from: "random",
        },
      }
    );

    hasMounted.current = true;
  }, [grid, startY]);

  // Handle card click
  const handleCardClick = (index: number) => {
    if (hasSelectedAny || animatingOut) return;

    // Check if card is taken by another player
    const isTakenByOther = Object.entries(duskCardSelections).some(
      ([pid, idx]) => pid !== clientId && idx === index
    );
    if (isTakenByOther) return;

    // Set local choice immediately and emit selection
    setLocalSelectedCard(index);
    onSelectCard(index);

    if (skipExitAnimation) {
      return;
    }

    // Wait 2 seconds, then trigger exit slide down animation
    setAnimatingOut(true);
    setTimeout(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          onSelectionComplete();
        },
      });

      tl.to(".masonry-item-wrapper", {
        y: startY,
        opacity: 0,
        duration: 0.6,
        ease: "power2.in",
        stagger: 0.05,
      });
    }, 250); //thời gian chờ trước khi bắt đầu animation out thẻ bài xuống (đừng chỉnh cái này nữa dùm)
  };

  return (
    <div className="masonry-selection-container">
      <h2 className="masonry-title">
        Chọn 1 lá bài bất kỳ
        {/* hasSelectedAny ? "Đang kết nối vai trò..." : "Hãy chọn 1 lá bài bất kỳ" */}
      </h2>
      <div
        ref={containerRef}
        className="masonry-list"
        style={{
          pointerEvents: hasSelectedAny || animatingOut ? "none" : "auto",
          height: `${gridHeight}px`,
        }}
      >
        {grid.map((item, index) => {
          const isTakenByOther = Object.entries(duskCardSelections).some(
            ([pid, idx]) => pid !== clientId && idx === index
          );
          const isSelectedByMe = selectedIndex === index;

          let cardClass = "masonry-item-wrapper normal-card";
          let style: React.CSSProperties = {
            left: `${item.x}px`,
            top: `${item.y}px`,
            width: `${item.w}px`,
            height: `${item.h}px`,
            position: "absolute",
          };

          if (isTakenByOther) {
            cardClass = "masonry-item-wrapper taken-card";
            if (hasSelectedAny && !isSelectedByMe) {
              cardClass += " dimmed-card";
            } else if (hoveredIndex !== null && hoveredIndex !== index) {
              cardClass += " pre-dimmed-card";
            }
          } else if (isSelectedByMe) {
            cardClass = "masonry-item-wrapper selected-card";
          } else if (hasSelectedAny) {
            cardClass = "masonry-item-wrapper dimmed-card";
          } else if (hoveredIndex !== null) {
            if (hoveredIndex === index) {
              cardClass = "masonry-item-wrapper hovered-card";
            } else {
              cardClass = "masonry-item-wrapper pre-dimmed-card";
            }
          }

          // Dynamic SVG filter drop shadow based on selection state
          let svgFilter = "drop-shadow(0 0 15px rgba(243, 85, 218, 0.4))"; // normal low performance
          if (isSelectedByMe) {
            svgFilter = "drop-shadow(0 0 25px rgba(243, 85, 218, 0.7)) drop-shadow(0 0 10px rgba(0, 242, 254, 0.5))"; // full holographic glow
          } else if (isTakenByOther || hasSelectedAny) {
            svgFilter = "none";
          }

          const gradId = `masonryHolo-${item.id}`;
          const silverGradId = `masonrySilver-${item.id}`;

          return (
            <div
              key={item.id}
              data-key={item.id}
              className={cardClass}
              style={style}
              onClick={() => handleCardClick(index)}
              onMouseEnter={() => !hasSelectedAny && !isTakenByOther && setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onTouchStart={() => !hasSelectedAny && !isTakenByOther && setHoveredIndex(index)}
              onTouchEnd={() => setHoveredIndex(null)}
            >
              <div
                className="masonry-item-img"
                style={{ backgroundImage: `url(${nenLungAsset})` }}
              >
                {/* Logo Moon SVG */}
                <svg
                  viewBox="0 0 511.99928 511"
                  className="masonry-moon-logo"
                  style={{
                    width: `${Math.min(80, item.h * 0.22)}px`, // điều chỉnh kích thước logo dựa trên chiều cao của thẻ bài, tối đa 80px để tránh quá lớn
                    height: `${Math.min(80, item.h * 0.22)}px`,
                    filter: svgFilter,
                    transition: "all 0.3s ease",
                  }}
                >
                  <defs>
                    {/* Holographic Gradient */}
                    <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="hsl(2, 100%, 73%)" />
                      <stop offset="20%" stopColor="hsl(53, 100%, 69%)" />
                      <stop offset="35%" stopColor="hsl(93, 100%, 69%)" />
                      <stop offset="50%" stopColor="#ffffff" />
                      <stop offset="65%" stopColor="hsl(176, 100%, 76%)" />
                      <stop offset="80%" stopColor="hsl(228, 100%, 74%)" />
                      <stop offset="100%" stopColor="hsl(283, 100%, 73%)" />
                    </linearGradient>

                    {/* Silver Gradient for dimmed cards */}
                    <linearGradient id={silverGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#d8d8d8" />
                      <stop offset="35%" stopColor="#a0a0a0" />
                      <stop offset="70%" stopColor="#ffffff" />
                      <stop offset="100%" stopColor="#7a7a7a" />
                    </linearGradient>
                  </defs>

                  <path
                    fill={isSelectedByMe ? `url(#${gradId})` : (isTakenByOther || hasSelectedAny ? `url(#${silverGradId})` : `url(#${gradId})`)}
                    d="m504.753906 305.828125c-5.824218-3.59375-13.34375-2.933594-18.386718 1.675781-36.726563 33.3125-84.234376 51.667969-133.746094 51.667969-109.894532 0-199.304688-89.410156-199.304688-199.304687 0-49.515626 18.355469-97.019532 51.667969-133.746094 4.59375-5.0625 5.285156-12.5625 1.675781-18.386719-3.609375-5.808594-10.675781-8.503906-17.203125-6.660156-111.558593 31.589843-189.457031 134.714843-189.457031 250.777343 0 143.71875 116.917969 260.632813 260.632812 260.632813 116.0625 0 219.191407-77.898437 250.78125-189.453125 1.871094-6.589844-.851562-13.597656-6.660156-17.203125zm0 0"
                  />
                  <path
                    fill={isSelectedByMe ? `url(#${gradId})` : (isTakenByOther || hasSelectedAny ? `url(#${silverGradId})` : `url(#${gradId})`)}
                    d="m253.882812 202.820312 36.320313 18.144532 18.144531 36.324218c2.589844 5.195313 7.90625 8.472657 13.714844 8.472657 5.8125 0 11.109375-3.277344 13.714844-8.472657l18.164062-36.324218 36.304688-18.144532c5.195312-2.605468 8.472656-7.90625 8.472656-13.714843 0-5.808594-3.277344-11.109375-8.472656-13.714844l-36.304688-18.148437-18.164062-36.320313c-5.210938-10.390625-22.246094-10.390625-27.429688 0l-18.144531 36.320313-36.320313 18.148437c-5.195312 2.589844-8.476562 7.90625-8.476562 13.714844 0 5.808593 3.28125 11.125 8.476562 13.714843zm0 0"
                  />
                  <path
                    fill={isSelectedByMe ? `url(#${gradId})` : (isTakenByOther || hasSelectedAny ? `url(#${silverGradId})` : `url(#${gradId})`)}
                    d="m413.945312 83.207031h15.332032v15.332031c0 8.472657 6.859375 15.332032 15.332031 15.332032s15.332031-6.859375 15.332031-15.332032v-15.332031h15.332032c8.472656 0 15.332031-6.855469 15.332031-15.332031 0-8.472656-6.859375-15.328125-15.332031-15.328125h-15.332032v-15.332031c0-8.476563-6.859375-15.332032-15.332031-15.332032s-15.332031 6.855469-15.332031 15.332032v15.332031h-15.332032c-8.472656 0-15.328124 6.855469-15.328124 15.328125 0 8.476562 6.855468 15.332031 15.328124 15.332031zm0 0"
                  />
                </svg>

                {/* Overlays */}
                {isTakenByOther && (
                  <div className="taken-overlay">
                    {/* <span>ĐÃ CHỌN</span> */}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Masonry;
