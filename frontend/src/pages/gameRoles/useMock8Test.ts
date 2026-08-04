import { useCallback, useMemo } from "react";
import { VILLAGER_BACKGROUND_ASSET, WOLF_BACKGROUND_ASSET } from "../../utils/rolePortraitAssets";

export function useMock8Test({
  roomId,
  roleOverride,
  setRoom,
  setPhase,
}: {
  roomId: string | null;
  room: any;
  roleOverride: string | null;
  setRoleOverride: React.Dispatch<React.SetStateAction<string | null>>;
  setRoom?: React.Dispatch<React.SetStateAction<any>>;
  setPhase?: React.Dispatch<React.SetStateAction<any>>;
}) {
  const isMock8 = roomId === "mock-8";

  // Click Ngày / Đêm thay đổi phase trong phòng mock-8 để chuyển đổi UI ngày/đêm
  const handleHeaderClick = useCallback(() => {
    if (!isMock8) return;

    if (setPhase) {
      setPhase((prev: any) => (prev === "day" ? "night" : "day"));
    }
    if (setRoom) {
      setRoom((prev: any) => {
        if (!prev) return prev;
        const currentPhase = prev.phase || "night";
        const nextPhase = currentPhase === "day" ? "night" : "day";
        return {
          ...prev,
          phase: nextPhase,
          // ponytail: P2 chết lúc trời sáng để mock-8 tái hiện hiệu ứng token mất màu + tan tên.
          deadPlayers: nextPhase === "day" ? ["P2"] : [],
        };
      });
    }
  }, [isMock8, setPhase, setRoom]);

  // Nền đè cho từng vai trò thử nghiệm
  const backgroundAssetOverride = useMemo(() => {
    if (!isMock8) return null;
    if (roleOverride === "Sói Dại") {
      return WOLF_BACKGROUND_ASSET;
    }
    return VILLAGER_BACKGROUND_ASSET;
  }, [isMock8, roleOverride]);

  return {
    handleHeaderClick: isMock8 ? handleHeaderClick : null,
    countdownSeconds: 71,
    isPaused: true,
    backgroundAssetOverride,
  };
}
