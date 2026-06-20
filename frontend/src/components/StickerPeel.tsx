import React, { useRef, useEffect, useMemo, useState, CSSProperties } from 'react';
import { gsap } from 'gsap';
import { Draggable } from 'gsap/Draggable';
import './StickerPeel.css';

gsap.registerPlugin(Draggable);

interface StickerPeelProps {
  imageSrc: string;
  createdAt: number;
  isOwner?: boolean;
  isPasted?: boolean;
  pastedAt?: number;
  startDragEvent?: any;
  onDeleteClick?: () => void;
  onDragStart?: () => void;
  onDragUpdate?: (x: number, y: number, isOverTrash: boolean) => void;
  onDragEnd?: (isDeleted: boolean, x: number, y: number) => void;
  onAnimationEnd?: () => void;
  rotate?: number;
  peelBackHoverPct?: number;
  peelBackActivePct?: number;
  peelEasing?: string;
  peelHoverEasing?: string;
  width?: number;
  initialPosition?: 'center' | 'random' | { x: number; y: number };
  peelDirection?: number;
  className?: string;
}

interface CSSVars extends CSSProperties {
  '--sticker-rotate'?: string;
  '--sticker-p'?: string;
  '--sticker-peelback-hover'?: string;
  '--sticker-peelback-active'?: string;
  '--sticker-peel-easing'?: string;
  '--sticker-peel-hover-easing'?: string;
  '--sticker-width'?: string;
  '--peel-direction'?: string;
}

const StickerPeel: React.FC<StickerPeelProps> = ({
  imageSrc,
  createdAt,
  isOwner = false,
  isPasted = false,
  pastedAt,
  startDragEvent,
  onDeleteClick,
  onDragStart,
  onDragUpdate,
  onDragEnd,
  onAnimationEnd,
  rotate = 30,
  peelBackHoverPct = 30,
  peelBackActivePct = 40,
  peelEasing = 'power3.out',
  peelHoverEasing = 'power2.out',
  width = 120,
  initialPosition = 'center',
  peelDirection = 0,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragTargetRef = useRef<HTMLDivElement>(null);
  const draggableInstanceRef = useRef<Draggable | null>(null);

  const [isFlyingAway, setIsFlyingAway] = useState(false);
  const [localIsPasted, setLocalIsPasted] = useState(isPasted);
  const defaultPadding = 10;

  // Sync prop changes to local state
  useEffect(() => {
    setLocalIsPasted(isPasted);
  }, [isPasted]);

  // Lifecycle timer (4 seconds max lifespan after pasted)
  useEffect(() => {
    if (!localIsPasted) return;

    const lifespanMs = 4000;
    const start = pastedAt || Date.now();
    const elapsed = Date.now() - start;
    const remainingTime = Math.max(0, lifespanMs - elapsed);

    const timer = setTimeout(() => {
      setIsFlyingAway(true);
    }, remainingTime);

    return () => clearTimeout(timer);
  }, [localIsPasted, pastedAt]);

  // Handle Fly Away animation using GSAP
  useEffect(() => {
    if (!isFlyingAway) return;
    const target = dragTargetRef.current;
    if (!target) return;

    if (draggableInstanceRef.current) {
      draggableInstanceRef.current.kill();
      draggableInstanceRef.current = null;
    }

    // Animate moving off the left edge, fading out, rotating
    gsap.to(target, {
      x: -width - 250,
      y: (gsap.getProperty(target, 'y') as number) + 100,
      rotation: -45,
      opacity: 0,
      duration: 1.2,
      ease: 'power2.in',
      onComplete: () => {
        if (onAnimationEnd) {
          onAnimationEnd();
        }
      }
    });
  }, [isFlyingAway, onAnimationEnd, width]);

  // Set initial position only once on mount
  useEffect(() => {
    const target = dragTargetRef.current;
    if (!target) return;

    let startX = 0,
      startY = 0;

    if (initialPosition === 'center') {
      startX = window.innerWidth / 2 - width / 2;
      startY = window.innerHeight / 2 - width / 2;
    } else if (initialPosition && typeof initialPosition === 'object' && initialPosition.x !== undefined && initialPosition.y !== undefined) {
      startX = initialPosition.x;
      startY = initialPosition.y;
    }

    gsap.set(target, { x: startX, y: startY });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase 1: Track pointer movements on window for initial drag (before pasted)
  useEffect(() => {
    if (localIsPasted || !isOwner || isFlyingAway) return;

    const target = dragTargetRef.current;
    if (!target) return;

    if (onDragStart) {
      onDragStart();
    }

    const handlePointerMove = (e: PointerEvent) => {
      const x = e.clientX - width / 2;
      const y = e.clientY - width / 2;

      gsap.set(target, { x, y });

      // Slight rotation based on horizontal movement
      const deltaX = e.movementX || 0;
      const rot = gsap.utils.clamp(-24, 24, deltaX * 0.4);
      gsap.to(target, { rotation: rot, duration: 0.15, ease: 'power1.out' });
      
      // Scale up to 1.1 during drag
      gsap.to(target, { scale: 1.1, duration: 0.2, overwrite: 'auto' });

      // Check if pointer is in the Trash Zone (bottom 10dvh)
      const pointerY = e.clientY;
      const trashHeight = window.innerHeight * 0.1;
      const isOverTrash = pointerY > window.innerHeight - trashHeight;

      if (onDragUpdate) {
        onDragUpdate(x, y, isOverTrash);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      const x = e.clientX - width / 2;
      const y = e.clientY - width / 2;
      const trashHeight = window.innerHeight * 0.1;
      const isOverTrash = e.clientY > window.innerHeight - trashHeight;

      if (isOverTrash) {
        // Thrown to trash: animate sliding down and fading out
        gsap.to(target, {
          y: window.innerHeight + 120,
          opacity: 0,
          duration: 0.4,
          ease: 'power2.in',
          onComplete: () => {
            if (onDragEnd) {
              onDragEnd(true, x, y); // isDeleted = true
            }
          }
        });
      } else {
        // Paste the sticker (scale back to 1.0)
        gsap.to(target, { scale: 1.0, rotation: 0, duration: 0.5, ease: 'power2.out' });
        setLocalIsPasted(true);
        if (onDragEnd) {
          onDragEnd(false, x, y); // isDeleted = false
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [localIsPasted, isOwner, isFlyingAway, width]);

  // Phase 2: Initialize GSAP Draggable for subsequent drags (after pasted)
  useEffect(() => {
    if (!isOwner || isFlyingAway || !localIsPasted) return;
    const target = dragTargetRef.current;
    if (!target) return;

    const boundsEl = document.body;

    const draggable = Draggable.create(target, {
      type: 'x,y',
      bounds: boundsEl,
      inertia: true,
      onDragStart(this: Draggable) {
        gsap.to(target, { scale: 1.1, duration: 0.2, ease: 'power2.out' });
        if (onDragStart) {
          onDragStart();
        }
      },
      onDrag(this: Draggable) {
        const rot = gsap.utils.clamp(-24, 24, this.deltaX * 0.4);
        gsap.to(target, { rotation: rot, duration: 0.15, ease: 'power1.out' });

        // Check if pointer is in the Trash Zone (bottom 10dvh)
        const pointerY = this.pointerY;
        const trashHeight = window.innerHeight * 0.1; // 10dvh
        const isOverTrash = pointerY > window.innerHeight - trashHeight;

        if (onDragUpdate) {
          onDragUpdate(this.x, this.y, isOverTrash);
        }
      },
      onDragEnd(this: Draggable) {
        // Check if pointer is in the Trash Zone
        const pointerY = this.pointerY;
        const trashHeight = window.innerHeight * 0.1;
        const isOverTrash = pointerY > window.innerHeight - trashHeight;

        if (isOverTrash) {
          // Thrown to trash: animate sliding down and fading out
          gsap.to(target, {
            y: window.innerHeight + 120,
            opacity: 0,
            duration: 0.4,
            ease: 'power2.in',
            onComplete: () => {
              if (onDragEnd) {
                onDragEnd(true, this.x, this.y); // isDeleted = true
              }
            }
          });
        } else {
          // Reset scale and rotation
          gsap.to(target, { scale: 1.0, duration: 0.3, ease: 'power2.out' });
          gsap.to(target, { rotation: 0, duration: 0.8, ease: 'power2.out' });

          if (onDragEnd) {
            onDragEnd(false, this.x, this.y); // isDeleted = false
          }
        }
      }
    });

    draggableInstanceRef.current = draggable[0];

    const handleResize = () => {
      if (draggableInstanceRef.current) {
        draggableInstanceRef.current.update();
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (draggableInstanceRef.current) {
        draggableInstanceRef.current.kill();
      }
    };
  }, [isOwner, isFlyingAway, localIsPasted]);

  // Touch class toggle
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = () => {
      container.classList.add('touch-active');
    };

    const handleTouchEnd = () => {
      container.classList.remove('touch-active');
    };

    container.addEventListener('touchstart', handleTouchStart);
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  const cssVars: CSSVars = useMemo(
    () => ({
      '--sticker-rotate': `${rotate}deg`,
      '--sticker-p': `${isFlyingAway ? width * 0.6 : defaultPadding}px`,
      '--sticker-peelback-hover': isFlyingAway ? '100%' : `${peelBackHoverPct}%`,
      '--sticker-peelback-active': `${peelBackActivePct}%`,
      '--sticker-peel-easing': peelEasing,
      '--sticker-peel-hover-easing': peelHoverEasing,
      '--sticker-width': `${width}px`,
      '--peel-direction': `${isFlyingAway ? 125 : peelDirection}deg`
    }),
    [
      rotate,
      peelBackHoverPct,
      peelBackActivePct,
      peelEasing,
      peelHoverEasing,
      width,
      peelDirection,
      isFlyingAway
    ]
  );

  return (
    <div 
      className={`draggable ${className} ${isOwner ? 'owner-draggable' : 'observer-draggable'}`} 
      ref={dragTargetRef} 
      style={cssVars}
    >
      <div 
        className={`sticker-container ${isFlyingAway ? 'peel-active' : ''} ${localIsPasted ? 'pasted' : ''}`} 
        ref={containerRef}
      >
        <div className="sticker-main">
          <img
            src={imageSrc}
            alt=""
            className="sticker-image"
            draggable="false"
            onContextMenu={e => e.preventDefault()}
          />
        </div>

        <div className="flap">
          <img
            src={imageSrc}
            alt=""
            className="flap-image"
            draggable="false"
            onContextMenu={e => e.preventDefault()}
          />
        </div>
      </div>
    </div>
  );
};

export default StickerPeel;
