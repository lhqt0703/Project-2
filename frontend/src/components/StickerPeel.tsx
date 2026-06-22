import React, { useRef, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
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
  onDragUpdate?: (x: number, y: number, isOverTrash: boolean, rotate?: number) => void;
  onDragEnd?: (isDeleted: boolean, x: number, y: number, rotate?: number) => void;
  onAnimationEnd?: () => void;
  onRelease?: () => void;
  rotate?: number;
  peelBackHoverPct?: number;
  peelBackActivePct?: number;
  peelEasing?: string;
  peelHoverEasing?: string;
  width?: number;
  initialPosition?: 'center' | 'random' | { x: number; y: number };
  peelDirection?: number;
  className?: string;
  x?: number;
  y?: number;
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
  isOwner = false,
  isPasted = false,
  pastedAt,
  onDragStart,
  onDragUpdate,
  onDragEnd,
  onAnimationEnd,
  onRelease,
  rotate = 30,
  peelBackHoverPct = 30,
  peelBackActivePct = 40,
  peelEasing = 'power3.out',
  peelHoverEasing = 'power2.out',
  width = 120,
  peelDirection = 0,
  className = '',
  x = 0.5,
  y = 0.5
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragTargetRef = useRef<HTMLDivElement>(null);
  const draggableInstanceRef = useRef<Draggable | null>(null);

  const getFrameRect = () => {
    const frameEl = document.querySelector(".player-position-frame");
    return frameEl ? frameEl.getBoundingClientRect() : null;
  };

  const [isFlyingAway, setIsFlyingAway] = useState(false);
  const [localIsPasted, setLocalIsPasted] = useState(isPasted);
  const [isPositioned, setIsPositioned] = useState(false);
  const [localIsDragging, setLocalIsDragging] = useState(!isPasted);
  const [isDeleting, setIsDeleting] = useState(false);
  const [observerPeelActive, setObserverPeelActive] = useState(false);
  const [scale, setScale] = useState(() => {
    const frameEl = document.querySelector(".player-position-frame");
    if (frameEl) {
      const rect = frameEl.getBoundingClientRect();
      return Math.max(0.55, Math.min(1, rect.width / 600));
    }
    return 1;
  });
  const scaledWidth = width * scale;
  const defaultPadding = 10;

  const dragOffsetXRef = useRef<number>(0);
  const dragOffsetYRef = useRef<number>(0);
  const isRelativeDraggingRef = useRef<boolean>(false);
  const hasCenteredRef = useRef<boolean>(false);
  const isCenteringRef = useRef<boolean>(false);

  const baseRotationRef = useRef<number>(rotate);
  const isDraggingRef = useRef<boolean>(false);
  const isRotatingRef = useRef<boolean>(false);
  const dragEndedRef = useRef<boolean>(false);
  const lastTouchAngleRef = useRef<number>(0);

  // Sync prop changes and run Entry/Exit animations for Observers
  const prevIsPastedRef = useRef(isPasted);
  useEffect(() => {
    if (isOwner) {
      if (!isDraggingRef.current) {
        setLocalIsPasted(isPasted);
      }
      return;
    }

    const target = dragTargetRef.current;
    if (!target) return;

    if (prevIsPastedRef.current === true && isPasted === false) {
      // Owner nhấc sticker lên: peel và fade out
      setObserverPeelActive(true);
      setLocalIsPasted(false);
      
      gsap.to(target, {
        opacity: 0,
        duration: 0.5,
        ease: 'power2.out',
        overwrite: 'auto'
      });
    } else if (prevIsPastedRef.current === false && isPasted === true) {
      // Owner dán sticker xuống: fade in peeled, rồi flatten dán phẳng
      setObserverPeelActive(true);
      setLocalIsPasted(false);

      // Đồng bộ vị trí tức thời trước khi hiện
      const frameRect = getFrameRect();
      if (frameRect) {
        gsap.set(target, { x: frameRect.left + x * frameRect.width, y: frameRect.top + y * frameRect.height });
      }

      gsap.set(target, { opacity: 0 });

      gsap.to(target, {
        opacity: 1,
        duration: 0.4,
        ease: 'power2.out',
        overwrite: 'auto',
        onComplete: () => {
          setObserverPeelActive(false);
          setLocalIsPasted(true);
        }
      });
    } else {
      // Trạng thái ban đầu lúc mount
      setLocalIsPasted(isPasted);
      if (!isPasted) {
        gsap.set(target, { opacity: 0 });
      }
    }
    prevIsPastedRef.current = isPasted;
  }, [isPasted, isOwner, x, y]);

  // Sync rotate prop changes to base rotation ref and CSS custom property
  useEffect(() => {
    baseRotationRef.current = rotate;
    const target = dragTargetRef.current;
    if (target) {
      target.style.setProperty('--sticker-rotate', `${rotate}deg`);
    }
  }, [rotate]);

  // Lifecycle timer (4 seconds max lifespan after pasted, paused while dragging or deleting)
  const [localPastedAt, setLocalPastedAt] = useState<number | null>(null);
  const isFirstMountRef = useRef(true);
  const lastPastedAtRef = useRef(pastedAt);

  useEffect(() => {
    if (localIsPasted) {
      if (isFirstMountRef.current) {
        setLocalPastedAt(pastedAt || Date.now());
      } else {
        if (pastedAt !== lastPastedAtRef.current) {
          setLocalPastedAt(pastedAt || Date.now());
        } else {
          setLocalPastedAt((prev) => prev || Date.now());
        }
      }
    } else {
      setLocalPastedAt(null);
    }
    lastPastedAtRef.current = pastedAt;
  }, [localIsPasted, pastedAt]);

  useEffect(() => {
    isFirstMountRef.current = false;
  }, []);

  useEffect(() => {
    if (!localIsPasted || localIsDragging || isDeleting || isFlyingAway || !localPastedAt) return;

    const lifespanMs = 4000;
    const start = localPastedAt;
    const elapsed = Date.now() - start;
    const remainingTime = Math.max(0, lifespanMs - elapsed);

    const timer = setTimeout(() => {
      setIsFlyingAway(true);
    }, remainingTime);

    return () => clearTimeout(timer);
  }, [localIsPasted, localPastedAt, localIsDragging, isDeleting, isFlyingAway]);

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
      x: -scaledWidth - 250,
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
  }, [isFlyingAway, onAnimationEnd, scaledWidth]);

  // Cập nhật kích thước và vị trí theo tỷ lệ của khung chứa
  const updateSizeAndPosition = () => {
    const target = dragTargetRef.current;
    if (!target) return;

    const frameRect = getFrameRect();
    if (!frameRect) return;

    // Tính tỷ lệ co giãn dựa trên chiều rộng khung chứa (giới hạn tương đương token từ 0.55 đến 1)
    const currentScale = Math.max(0.55, Math.min(1, frameRect.width / 600));
    setScale(currentScale);

    if (!isDraggingRef.current) {
      const targetX = frameRect.left + x * frameRect.width;
      const targetY = frameRect.top + y * frameRect.height;

      if (!isPositioned) {
        const initialOpacity = (isPasted || isOwner) ? 1 : 0;
        gsap.set(target, { x: targetX, y: targetY, opacity: initialOpacity });
        setIsPositioned(true);
      } else {
        if (!isOwner && !isPasted) {
          gsap.set(target, { x: targetX, y: targetY, opacity: 0 });
        } else {
          gsap.to(target, {
            x: targetX,
            y: targetY,
            duration: 0.35,
            ease: 'power2.out',
            overwrite: 'auto'
          });
        }
      }
    }
  };

  useEffect(() => {
    updateSizeAndPosition();
  }, [x, y, localIsPasted, isPositioned, isOwner, isPasted]);

  useEffect(() => {
    const handleResize = () => {
      updateSizeAndPosition();
      if (draggableInstanceRef.current) {
        draggableInstanceRef.current.update();
      }
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [x, y, isPositioned, isOwner, isPasted]);

  // Phase 1: Track pointer movements on window for initial drag (before pasted)
  useEffect(() => {
    if (localIsPasted || !isOwner || isFlyingAway) return;

    const target = dragTargetRef.current;
    if (!target) return;

    dragEndedRef.current = false;
    isDraggingRef.current = true;
    hasCenteredRef.current = false;
    isCenteringRef.current = false;

    if (onDragStart) {
      onDragStart();
    }

    // Chặn cuộn trang bằng cách preventDefault sự kiện touchmove/wheel
    const preventScroll = (e: TouchEvent | WheelEvent) => {
      if (e.cancelable) {
        e.preventDefault();
      }
    };

    window.addEventListener('touchmove', preventScroll, { passive: false });
    window.addEventListener('wheel', preventScroll, { passive: false });

    const handlePointerMove = (e: PointerEvent) => {
      if (isRotatingRef.current || isRelativeDraggingRef.current) return;

      // Nếu là chuột và không có nút chuột nào đang nhấn (người dùng đã thả chuột từ trước khi render xong)
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        handlePointerUp(e);
        return;
      }

      const xVal = e.clientX - scaledWidth / 2;
      const yVal = e.clientY - scaledWidth / 2;

      gsap.set(target, { x: xVal, y: yVal });

      // Slight rotation based on horizontal movement
      const deltaX = e.movementX || 0;
      const rot = gsap.utils.clamp(-24, 24, deltaX * 0.4);
      gsap.to(target, { rotation: rot, duration: 0.15, ease: 'power1.out' });

      // Check if pointer is in the Trash Zone (bottom 10dvh)
      const pointerY = e.clientY;
      const trashHeight = window.innerHeight * 0.1;
      const isOverTrash = pointerY > window.innerHeight - trashHeight;

      if (onDragUpdate) {
        onDragUpdate(xVal, yVal, isOverTrash, baseRotationRef.current);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isRotatingRef.current || isRelativeDraggingRef.current) return;
      if (dragEndedRef.current) return;
      dragEndedRef.current = true;
      isDraggingRef.current = false;
      setLocalIsDragging(false);

      window.removeEventListener('touchmove', preventScroll);
      window.removeEventListener('wheel', preventScroll);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      const frameRect = getFrameRect();
      if (!frameRect) return;

      const xVal = e.clientX - scaledWidth / 2;
      const yVal = e.clientY - scaledWidth / 2;
      
      const finalXPct = (xVal - frameRect.left) / frameRect.width;
      const finalYPct = (yVal - frameRect.top) / frameRect.height;
      const trashHeight = window.innerHeight * 0.1;
      const isOverTrash = e.clientY > window.innerHeight - trashHeight;

      if (isOverTrash) {
        setIsDeleting(true);
        if (onRelease) onRelease();
        // Thrown to trash: animate sliding down and fading out
        gsap.to(target, {
          y: window.innerHeight + 120,
          opacity: 0,
          duration: 0.4,
          ease: 'power2.in',
          onComplete: () => {
            if (onDragEnd) {
              onDragEnd(true, finalXPct, finalYPct, baseRotationRef.current);
            }
          }
        });
      } else {
        // Paste the sticker
        gsap.to(target, { rotation: 0, duration: 0.5, ease: 'power2.out' });
        setLocalIsPasted(true);
        setLocalPastedAt(Date.now());
        if (onDragEnd) {
          onDragEnd(false, finalXPct, finalYPct, baseRotationRef.current);
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('touchmove', preventScroll);
      window.removeEventListener('wheel', preventScroll);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [localIsPasted, isOwner, isFlyingAway, scaledWidth]);

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
        dragEndedRef.current = false;
        isDraggingRef.current = true;
        setLocalIsDragging(true);
        hasCenteredRef.current = false;
        isCenteringRef.current = false;
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
          onDragUpdate(this.x, this.y, isOverTrash, baseRotationRef.current);
        }
      },
      onDragEnd(this: Draggable) {
        if (isRotatingRef.current) {
          // Bỏ qua vì cử chỉ xoay 2 ngón tay đang tiếp quản, 
          // việc kết thúc kéo sẽ được xử lý bởi touchend global.
          return;
        }
        if (dragEndedRef.current) return;
        dragEndedRef.current = true;
        isDraggingRef.current = false;
        setLocalIsDragging(false);

        // Check if pointer is in the Trash Zone
        const pointerY = this.pointerY;
        const trashHeight = window.innerHeight * 0.1;
        const isOverTrash = pointerY > window.innerHeight - trashHeight;

        const frameRect = getFrameRect();
        if (!frameRect) return;

        const finalXPct = (this.x - frameRect.left) / frameRect.width;
        const finalYPct = (this.y - frameRect.top) / frameRect.height;

        if (isOverTrash) {
          setIsDeleting(true);
          if (onRelease) onRelease();
          // Thrown to trash: animate sliding down and fading out
          gsap.to(target, {
            y: window.innerHeight + 120,
            opacity: 0,
            duration: 0.4,
            ease: 'power2.in',
            onComplete: () => {
              if (onDragEnd) {
                onDragEnd(true, finalXPct, finalYPct, baseRotationRef.current);
              }
            }
          });
        } else {
          // Reset scale and rotation
          gsap.to(target, { scale: 1.0, duration: 0.3, ease: 'power2.out' });
          gsap.to(target, { rotation: 0, duration: 0.8, ease: 'power2.out' });
          setLocalPastedAt(Date.now());

          if (onDragEnd) {
            onDragEnd(false, finalXPct, finalYPct, baseRotationRef.current);
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

  // Phase 3: Global Event Listeners for Rotation Gestures (Mouse Wheel & Multi-touch Rotate)
  useEffect(() => {
    if (!isOwner || isFlyingAway) return;

    const handleGlobalWheel = (e: WheelEvent) => {
      if (!isDraggingRef.current) return;

      if (e.cancelable) {
        e.preventDefault();
      }

      const delta = e.deltaY;
      const rotateStep = 10;
      const currentRot = baseRotationRef.current;
      const newRot = delta < 0 ? currentRot - rotateStep : currentRot + rotateStep;

      baseRotationRef.current = newRot;
      const target = dragTargetRef.current;
      if (target) {
        target.style.setProperty('--sticker-rotate', `${newRot}deg`);
      }

      if (target && onDragUpdate) {
        const x = gsap.getProperty(target, 'x') as number;
        const y = gsap.getProperty(target, 'y') as number;
        const pointerY = e.clientY;
        const trashHeight = window.innerHeight * 0.1;
        const isOverTrash = pointerY > window.innerHeight - trashHeight;
        onDragUpdate(x, y, isOverTrash, baseRotationRef.current);
      }
    };

    const handleGlobalTouchStart = (e: TouchEvent) => {
      if (!isDraggingRef.current) return;

      if (e.touches.length === 2) {
        isRotatingRef.current = true;

        if (draggableInstanceRef.current) {
          draggableInstanceRef.current.disable();
        }

        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        lastTouchAngleRef.current = Math.atan2(dy, dx) * (180 / Math.PI);

        const target = dragTargetRef.current;
        if (!target) return;

        const midX = (touch1.clientX + touch2.clientX) / 2 - scaledWidth / 2;
        const midY = (touch1.clientY + touch2.clientY) / 2 - scaledWidth / 2;

        if (target) {
          if (!hasCenteredRef.current) {
            // Lần chạm 2 ngón tay đầu tiên: transition mượt mà ra trung điểm
            hasCenteredRef.current = true;
            isCenteringRef.current = true;
            dragOffsetXRef.current = 0;
            dragOffsetYRef.current = 0;

            gsap.to(target, {
              x: midX,
              y: midY,
              duration: 0.25,
              ease: 'power2.out',
              onComplete: () => {
                isCenteringRef.current = false;
              }
            });
          } else {
            // Các lần chạm 2 ngón tay tiếp theo: giữ nguyên vị trí, tính offset tương đối
            const currentX = gsap.getProperty(target, 'x') as number;
            const currentY = gsap.getProperty(target, 'y') as number;
            dragOffsetXRef.current = currentX - midX;
            dragOffsetYRef.current = currentY - midY;
            isCenteringRef.current = false;
          }
        }
      }
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current) return;

      if (e.touches.length === 2) {
        if (e.cancelable) {
          e.preventDefault();
        }

        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;

        const target = dragTargetRef.current;
        if (!target) return;

        const midX = (touch1.clientX + touch2.clientX) / 2 - scaledWidth / 2;
        const midY = (touch1.clientY + touch2.clientY) / 2 - scaledWidth / 2;

        if (!isRotatingRef.current) {
          isRotatingRef.current = true;
          if (draggableInstanceRef.current) {
            draggableInstanceRef.current.disable();
          }
          lastTouchAngleRef.current = Math.atan2(dy, dx) * (180 / Math.PI);
          
          if (!hasCenteredRef.current) {
            hasCenteredRef.current = true;
            isCenteringRef.current = true;
            dragOffsetXRef.current = 0;
            dragOffsetYRef.current = 0;
            gsap.to(target, {
              x: midX,
              y: midY,
              duration: 0.25,
              ease: 'power2.out',
              onComplete: () => {
                isCenteringRef.current = false;
              }
            });
          } else {
            const currentX = gsap.getProperty(target, 'x') as number;
            const currentY = gsap.getProperty(target, 'y') as number;
            dragOffsetXRef.current = currentX - midX;
            dragOffsetYRef.current = currentY - midY;
          }
        }

        // 1. Move/Follow center
        if (isCenteringRef.current) {
          // Bám đuổi mượt mà theo trung điểm khi đang transition
          gsap.to(target, {
            x: midX,
            y: midY,
            duration: 0.1,
            overwrite: 'auto'
          });
        } else {
          const x = midX + dragOffsetXRef.current;
          const y = midY + dragOffsetYRef.current;
          gsap.set(target, { x, y });
        }

        // 2. Rotate according to touch angle delta
        const currentTouchAngle = Math.atan2(dy, dx) * (180 / Math.PI);
        let deltaAngle = currentTouchAngle - lastTouchAngleRef.current;
        
        // Chuẩn hóa hiệu góc để tránh giật quay tít mù khi đi qua ranh giới 180 độ
        if (deltaAngle < -180) deltaAngle += 360;
        if (deltaAngle > 180) deltaAngle -= 360;

        // Giảm độ nhạy (damping) khi khoảng cách hai chạm quá gần để tránh run tay làm xoay mạnh
        const distance = Math.hypot(dx, dy);
        if (distance < 50) {
          deltaAngle *= 0.25; // Giảm độ nhạy đi 4 lần
        } else if (distance < 100) {
          deltaAngle *= 0.55; // Giảm độ nhạy đi gần 2 lần
        }

        const newRotation = baseRotationRef.current + deltaAngle;
        baseRotationRef.current = newRotation;
        target.style.setProperty('--sticker-rotate', `${newRotation}deg`);

        lastTouchAngleRef.current = currentTouchAngle;

        const curX = gsap.getProperty(target, 'x') as number;
        const curY = gsap.getProperty(target, 'y') as number;
        const trashHeight = window.innerHeight * 0.1;
        const isOverTrash = (touch1.clientY + touch2.clientY) / 2 > window.innerHeight - trashHeight;

        if (onDragUpdate) {
          onDragUpdate(curX, curY, isOverTrash, baseRotationRef.current);
        }
      } else if (e.touches.length === 1 && isRelativeDraggingRef.current) {
        if (e.cancelable) {
          e.preventDefault();
        }

        const target = dragTargetRef.current;
        if (!target) return;

        const touch = e.touches[0];
        const x = touch.clientX + dragOffsetXRef.current;
        const y = touch.clientY + dragOffsetYRef.current;

        gsap.set(target, { x, y });

        const trashHeight = window.innerHeight * 0.1;
        const isOverTrash = touch.clientY > window.innerHeight - trashHeight;

        if (onDragUpdate) {
          onDragUpdate(x, y, isOverTrash, baseRotationRef.current);
        }
      }
    };

    const handleGlobalTouchEnd = (e: TouchEvent) => {
      if (!isDraggingRef.current) return;

      // 1. Khi đang xoay (2 ngón) và nhấc bớt ngón tay ra (còn 1 ngón)
      if (isRotatingRef.current && e.touches.length === 1) {
        isRotatingRef.current = false;

        const touch = e.touches[0];
        const target = dragTargetRef.current;
        if (target) {
          const currentX = gsap.getProperty(target, 'x') as number;
          const currentY = gsap.getProperty(target, 'y') as number;
          dragOffsetXRef.current = currentX - touch.clientX;
          dragOffsetYRef.current = currentY - touch.clientY;
          isRelativeDraggingRef.current = true;
        }
        return; // Tiếp tục di chuyển bằng 1 ngón còn lại
      }

      // 2. Khi nhấc ngón tay cuối cùng ra
      if (e.touches.length === 0) {
        const wasRotating = isRotatingRef.current;
        const wasRelative = isRelativeDraggingRef.current;

        isRotatingRef.current = false;
        isRelativeDraggingRef.current = false;

        const target = dragTargetRef.current;
        if (!target) return;

        if (draggableInstanceRef.current) {
          draggableInstanceRef.current.enable();
        }

        // Chỉ xử lý kết thúc kéo nếu ta đang ở chế độ xoay hoặc kéo tương đối
        if (wasRotating || wasRelative) {
          if (dragEndedRef.current) return;
          dragEndedRef.current = true;
          isDraggingRef.current = false;
          setLocalIsDragging(false);

          const x = gsap.getProperty(target, 'x') as number;
          const y = gsap.getProperty(target, 'y') as number;
          
          const frameRect = getFrameRect();
          if (!frameRect) return;

          const finalXPct = (x - frameRect.left) / frameRect.width;
          const finalYPct = (y - frameRect.top) / frameRect.height;

          const trashHeight = window.innerHeight * 0.1;
          
          let clientY = window.innerHeight / 2;
          if (e.changedTouches && e.changedTouches.length > 0) {
            clientY = e.changedTouches[0].clientY;
          }
          const isOverTrash = clientY > window.innerHeight - trashHeight;

          if (isOverTrash) {
            setIsDeleting(true);
            if (onRelease) onRelease();
            gsap.to(target, {
              y: window.innerHeight + 120,
              opacity: 0,
              duration: 0.4,
              ease: 'power2.in',
              onComplete: () => {
                if (onDragEnd) {
                  onDragEnd(true, finalXPct, finalYPct, baseRotationRef.current);
                }
              }
            });
          } else {
            gsap.to(target, { rotation: 0, duration: 0.5, ease: 'power2.out' });
            setLocalIsPasted(true);
            setLocalPastedAt(Date.now());
            if (onDragEnd) {
              onDragEnd(false, finalXPct, finalYPct, baseRotationRef.current);
            }
          }
        }
      }
    };

    window.addEventListener('wheel', handleGlobalWheel, { passive: false });
    window.addEventListener('touchstart', handleGlobalTouchStart, { passive: true });
    window.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    window.addEventListener('touchend', handleGlobalTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleGlobalTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('wheel', handleGlobalWheel);
      window.removeEventListener('touchstart', handleGlobalTouchStart);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
      window.removeEventListener('touchcancel', handleGlobalTouchEnd);
    };
  }, [width, onDragUpdate, onDragEnd, isOwner, isFlyingAway]);

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
      '--sticker-p': `${defaultPadding}px`,
      '--sticker-peelback-hover': isFlyingAway ? '100%' : `${peelBackHoverPct}%`,
      '--sticker-peelback-active': `${peelBackActivePct}%`,
      '--sticker-peel-easing': peelEasing,
      '--sticker-peel-hover-easing': peelHoverEasing,
      '--sticker-width': `${scaledWidth}px`,
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
      style={{
        ...cssVars,
        opacity: isPositioned ? undefined : 0,
        visibility: isPositioned ? undefined : 'hidden'
      }}
    >
      <div 
        className={`sticker-container ${isFlyingAway || observerPeelActive ? 'peel-active' : ''} ${localIsPasted ? 'pasted' : ''}`} 
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
