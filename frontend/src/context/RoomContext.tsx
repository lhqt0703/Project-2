import React, { createContext, useContext, useState } from "react";

interface Player {
  id: string;
  name: string;
}

// RoomData như file Room.tsx
interface RoomData {
  id: string;
  players: Player[];
  hostId: string;
  positions?: PlayerPosition[];
  positionEditors?: string[];
}

// Khi nào làm file PlayerPosition riêng thì import từ đó
interface PlayerPosition {
  playerId: string;
  x: number;
  y: number;
}

interface RoomContextType {
  role: string | null;
  setRole: React.Dispatch<React.SetStateAction<string | null>>;

  room: RoomData | null;
  setRoom: React.Dispatch<React.SetStateAction<RoomData | null>>;
}

const RoomContext = createContext<RoomContextType | undefined>(undefined);

export const RoomProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomData | null>(null);

  return (
    <RoomContext.Provider value={{ role, setRole, room, setRoom }}>
      {children}
    </RoomContext.Provider>
  );
};

export const useRoomContext = () => {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error("useRoomContext must be used within RoomProvider");
  return ctx;
};
