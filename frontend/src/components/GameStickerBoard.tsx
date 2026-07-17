import { clientId } from "../socket";
import type { Sticker } from "../pages/gameRoles/socketEvents";
import { getStickerUrlByFileName } from "../utils/stickerAssets";
import StickerPeel from "./StickerPeel";
import "./GameStickerBoard.css";

interface GameStickerBoardProps {
  visible: boolean;
  stickers: Sticker[];
  dismissedStickerIds: string[];
  onDismissSticker: (stickerId: string) => void;
  onDraggingStickerChange: (stickerId: string | null) => void;
  onTrashHoverChange: (isOverTrash: boolean) => void;
  onDragStartSticker: (stickerId: string, channel: Sticker["channel"]) => void;
  onDragUpdateSticker: (
    stickerId: string,
    x: number,
    y: number,
    channel: Sticker["channel"],
    isPasted?: boolean,
    pastedAt?: number,
    rotate?: number,
  ) => void;
  onDeleteSticker: (stickerId: string, channel: Sticker["channel"]) => void;
}

export function GameStickerBoard({
  visible,
  stickers,
  dismissedStickerIds,
  onDismissSticker,
  onDraggingStickerChange,
  onTrashHoverChange,
  onDragStartSticker,
  onDragUpdateSticker,
  onDeleteSticker,
}: GameStickerBoardProps) {
  return (
    <div className={`game-sticker-board${visible ? " game-sticker-board--visible" : ""}`}>
      {stickers
        .filter((sticker) => !dismissedStickerIds.includes(sticker.id))
        .map((sticker) => {
          const resolvedUrl = getStickerUrlByFileName(sticker.imageSrc);
          if (!resolvedUrl) return null;
          const isOwner = sticker.owner === clientId;

          return (
            <StickerPeel
              key={sticker.id}
              imageSrc={resolvedUrl}
              createdAt={sticker.createdAt}
              isOwner={isOwner}
              isPasted={sticker.isPasted}
              pastedAt={sticker.pastedAt}
              onDismiss={() => onDismissSticker(sticker.id)}
              onDragStart={() => {
                if (!isOwner) return;
                onDraggingStickerChange(sticker.id);
                onDragStartSticker(sticker.id, sticker.channel);
              }}
              onDragUpdate={(_x, _y, overTrash) => {
                if (isOwner) onTrashHoverChange(overTrash);
              }}
              onRelease={() => {
                if (!isOwner) return;
                onDraggingStickerChange(null);
                onTrashHoverChange(false);
              }}
              onDragEnd={(isDeleted, finalX, finalY, finalRotation) => {
                if (!isOwner) return;
                if (isDeleted) {
                  onDeleteSticker(sticker.id, sticker.channel);
                  return;
                }

                onDraggingStickerChange(null);
                onTrashHoverChange(false);
                onDragUpdateSticker(
                  sticker.id,
                  finalX,
                  finalY,
                  sticker.channel,
                  true,
                  Date.now(),
                  finalRotation ?? sticker.rotate,
                );
              }}
              onDeleteClick={() => onDeleteSticker(sticker.id, sticker.channel)}
              onAnimationEnd={() => {
                if (isOwner) onDeleteSticker(sticker.id, sticker.channel);
              }}
              rotate={sticker.rotate}
              x={sticker.x}
              y={sticker.y}
            />
          );
        })}
    </div>
  );
}
