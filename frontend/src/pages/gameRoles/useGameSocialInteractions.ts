import { useCallback, useEffect, useState } from "react";
import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction, TouchEvent as ReactTouchEvent } from "react";
import { clientId, socket } from "../../socket";
import type { GamePhase, Sticker } from "./socketEvents";
import type { PlayerMessage } from "./useGameSocketSync";

type StickerChannel = Sticker["channel"];
type StickerSelectionEvent = ReactMouseEvent | ReactTouchEvent | null;

interface UseGameSocialInteractionsOptions {
  roomId: string | null;
  phase: GamePhase;
  stickers: Sticker[];
  setStickers: Dispatch<SetStateAction<Sticker[]>>;
  setPlayerMessages: Dispatch<SetStateAction<PlayerMessage[]>>;
}

export function useGameSocialInteractions({
  roomId,
  phase,
  stickers,
  setStickers,
  setPlayerMessages,
}: UseGameSocialInteractionsOptions) {
  const [windowDimensions, setWindowDimensions] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [dismissedStickers, setDismissedStickers] = useState<{
    phase: GamePhase;
    ids: string[];
  }>({ phase, ids: [] });
  const [draggingStickerId, setDraggingStickerId] = useState<string | null>(null);
  const [isOverTrash, setIsOverTrash] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  const dismissedStickerIds = dismissedStickers.phase === phase ? dismissedStickers.ids : [];

  const dismissSticker = useCallback((stickerId: string) => {
    setDismissedStickers((previous) => ({
      phase,
      ids: previous.phase === phase ? [...previous.ids, stickerId] : [stickerId],
    }));
  }, [phase]);

  const handleSendPlayerMessage = useCallback((text: string, channel: StickerChannel) => {
    const id = Math.random().toString(36).substring(2, 9);
    const createdAt = Date.now();

    if (roomId === "mock-8") {
      setPlayerMessages((previousMessages) => [
        ...previousMessages,
        { id, senderId: clientId, text, channel, createdAt },
      ]);
      return;
    }

    socket.emit("placePlayerMessage", {
      roomId,
      message: { id, text, channel, createdAt },
    });
  }, [roomId, setPlayerMessages]);

  const dismissPlayerMessage = useCallback((messageId: string) => {
    setPlayerMessages((previousMessages) => (
      previousMessages.filter((message) => message.id !== messageId)
    ));
  }, [setPlayerMessages]);

  const handleSelectSticker = useCallback((
    filename: string,
    channel: StickerChannel,
    event?: StickerSelectionEvent,
  ) => {
    const id = `sticker-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const isStaticPaste = !event;
    let xPct = 0.5;
    let yPct = 0.5;
    let clientX = windowDimensions.width / 2;
    let clientY = windowDimensions.height / 2;

    if (event) {
      const nativeEvent = event.nativeEvent;
      if ("touches" in nativeEvent && nativeEvent.touches.length > 0) {
        clientX = nativeEvent.touches[0].clientX;
        clientY = nativeEvent.touches[0].clientY;
      } else if ("clientX" in nativeEvent) {
        clientX = nativeEvent.clientX;
        clientY = nativeEvent.clientY;
      }

      const frameRect = document.querySelector(".player-position-frame")?.getBoundingClientRect();
      const stickerWidth = 100;
      if (frameRect) {
        xPct = (clientX - frameRect.left - stickerWidth / 2) / frameRect.width;
        yPct = (clientY - frameRect.top - stickerWidth / 2) / frameRect.height;
      } else {
        xPct = (clientX - stickerWidth / 2) / windowDimensions.width;
        yPct = (clientY - stickerWidth / 2) / windowDimensions.height;
      }
    }

    const createdAt = Date.now();
    const sticker: Sticker = {
      id,
      imageSrc: filename,
      x: xPct,
      y: yPct,
      rotate: Math.floor(Math.random() * 40 - 20),
      channel,
      createdAt,
      owner: clientId,
      isPasted: isStaticPaste,
      pastedAt: isStaticPaste ? createdAt : undefined,
    };

    setStickers((previousStickers) => [...previousStickers, sticker]);
    if (roomId === "mock-8") return;

    socket.emit("placeSticker", {
      roomId,
      sticker: {
        id: sticker.id,
        imageSrc: sticker.imageSrc,
        x: sticker.x,
        y: sticker.y,
        rotate: sticker.rotate,
        channel: sticker.channel,
        createdAt: sticker.createdAt,
        isPasted: sticker.isPasted,
        pastedAt: sticker.pastedAt,
      },
    });
  }, [roomId, setStickers, windowDimensions]);

  const handleDragUpdateSticker = useCallback((
    stickerId: string,
    xPct: number,
    yPct: number,
    channel: StickerChannel,
    isPasted?: boolean,
    pastedAt?: number,
    rotate?: number,
  ) => {
    setStickers((previousStickers) => previousStickers.map((sticker) => (
      sticker.id === stickerId
        ? {
            ...sticker,
            x: xPct,
            y: yPct,
            isPasted: isPasted ?? sticker.isPasted,
            pastedAt: pastedAt ?? sticker.pastedAt,
            rotate: rotate ?? sticker.rotate,
          }
        : sticker
    )));

    if (roomId === "mock-8") return;
    socket.emit("moveSticker", {
      roomId,
      stickerId,
      x: xPct,
      y: yPct,
      channel,
      isPasted,
      pastedAt,
      rotate,
    });
  }, [roomId, setStickers]);

  const handleDragStartSticker = useCallback((stickerId: string, channel: StickerChannel) => {
    setStickers((previousStickers) => previousStickers.map((sticker) => (
      sticker.id === stickerId ? { ...sticker, isPasted: false } : sticker
    )));

    if (roomId === "mock-8") return;
    const sticker = stickers.find((candidate) => candidate.id === stickerId);
    if (!sticker) return;

    socket.emit("moveSticker", {
      roomId,
      stickerId,
      x: sticker.x,
      y: sticker.y,
      channel,
      isPasted: false,
      rotate: sticker.rotate,
    });
  }, [roomId, setStickers, stickers]);

  const handleDeleteSticker = useCallback((stickerId: string, channel: StickerChannel) => {
    setStickers((previousStickers) => previousStickers.filter((sticker) => sticker.id !== stickerId));
    if (roomId === "mock-8") return;

    socket.emit("deleteSticker", { roomId, stickerId, channel });
  }, [roomId, setStickers]);

  return {
    dismissedStickerIds,
    dismissSticker,
    draggingStickerId,
    setDraggingStickerId,
    isOverTrash,
    setIsOverTrash,
    handleSendPlayerMessage,
    dismissPlayerMessage,
    handleSelectSticker,
    handleDragUpdateSticker,
    handleDragStartSticker,
    handleDeleteSticker,
  };
}
