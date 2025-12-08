import React, { createContext, useContext, useState } from "react";

interface RoomContextType {
  role: string | null;
  setRole: (role: string | null) => void;
  room: string;
  setRoom: (room: string) => void;
}

const RoomContext = createContext<RoomContextType | undefined>(undefined);

export const RoomProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<string | null>(null);
  const [room, setRoom] = useState<string>(null);

  return (
    <RoomContext.Provider value={{ role, setRole, room, setRoom }}>
      {children}
    </RoomContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useRoomContext = () => {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error("useRoomContext must be used within RoomProvider");
  return ctx;
};
