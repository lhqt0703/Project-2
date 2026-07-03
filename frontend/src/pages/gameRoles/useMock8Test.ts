import { useEffect, useCallback, useMemo } from "react";
import { VILLAGER_BACKGROUND_ASSET, WOLF_BACKGROUND_ASSET } from "../../components/RoleCharacterPortrait";

export function useMock8Test({
  roomId,
  room,
  deadPlayers,
  playHunterShotAnim,
  setIsNightInfoVisible: _setIsNightInfoVisible,
  setCardFlippedToFront: _setCardFlippedToFront,
  debugAnim,
  roleOverride,
  setRoleOverride: _setRoleOverride,
}: {
  roomId: string | null;
  room: any;
  deadPlayers: string[];
  playHunterShotAnim: (fromPlayerId: string, toPlayerId: string, options?: any) => void;
  setIsNightInfoVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setCardFlippedToFront: React.Dispatch<React.SetStateAction<boolean>>;
  debugAnim: boolean;
  roleOverride: string | null;
  setRoleOverride: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const isMock8 = roomId === "mock-8";

  // Đăng ký phím tắt test Shift+C / Shift+H
  useEffect(() => {
    if (!isMock8 || !room) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const isDebugCupid = new URLSearchParams(window.location.search).get("debugCupid") === "1";
      if (!isDebugCupid && !debugAnim) return;

      const alive = room.players
        .map((p: any) => p.id)
        .filter((id: string) => !deadPlayers.includes(id));
      if (alive.length === 0) return;

      if (e.key.toLowerCase() === "h" && e.shiftKey) {
        if (alive.length < 2) return;
        const from = alive[Math.floor(Math.random() * alive.length)]!;
        let to = from;
        for (let i = 0; i < 10 && to === from; i++) {
          to = alive[Math.floor(Math.random() * alive.length)]!;
        }
        if (to === from) return;
        playHunterShotAnim(from, to);
      }

      if (e.key.toLowerCase() === "c" && e.shiftKey) {
        const to = alive[Math.floor(Math.random() * alive.length)]!;
        playHunterShotAnim("P1", to, {
          assetSrc: encodeURI("/Mũi tên.svg"),
          alt: "Mũi tên",
          rotationOffsetDeg: -45,
          kind: "love",
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMock8, room, deadPlayers, playHunterShotAnim, debugAnim]);

  // Click Ngày / Đêm bắn Cupid
  const handleHeaderClick = useCallback(() => {
    if (!isMock8 || !room) return;

    const isDebugCupid = new URLSearchParams(window.location.search).get("debugCupid") === "1";
    if (!isDebugCupid && !debugAnim) return;

    const alive = room.players
      .map((p: any) => p.id)
      .filter((id: string) => !deadPlayers.includes(id));
    if (alive.length === 0) return;

    if (isDebugCupid) {
      const to = alive[Math.floor(Math.random() * alive.length)]!;
      playHunterShotAnim("P1", to, {
        assetSrc: encodeURI("/Mũi tên.svg"),
        alt: "Mũi tên",
        rotationOffsetDeg: -45,
        kind: "love",
      });
    } else if (debugAnim) {
      if (alive.length < 2) return;
      const from = alive[Math.floor(Math.random() * alive.length)]!;
      let to = from;
      for (let i = 0; i < 10 && to === from; i++) {
        to = alive[Math.floor(Math.random() * alive.length)]!;
      }
      if (to === from) return;
      playHunterShotAnim(from, to);
    }
  }, [isMock8, room, deadPlayers, playHunterShotAnim, debugAnim]);

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
