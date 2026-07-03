import * as fs from "fs";
import * as path from "path";
import type { Room } from "./serverTypes.js";

const HISTORY_DIR = path.join(process.cwd(), "data", "history");

/**
 * Saves a completed match summary, players list, and event log to the filesystem.
 */
export function saveMatchHistory(room: Room) {
  if (!room.id) return;

  try {
    // Ensure the history directory exists
    fs.mkdirSync(HISTORY_DIR, { recursive: true });

    const payload = {
      gameId: room.id,
      timestamp: Date.now(),
      hostId: room.hostId,
      playerCount: room.players.length,
      winner: room.winner || null,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        playerRealName: p.playerRealName,
        playerAvatar: p.playerAvatar,
        role: room.playerRoles?.[p.id] || "Dân làng",
      })),
      positions: room.positions || [],
      gameEventLog: room.gameEventLog || [],
      gameLog: room.gameLog || [],
    };

    const fileName = `match_${room.id}_${Date.now()}.json`;
    const filePath = path.join(HISTORY_DIR, fileName);

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save match history:", err);
  }
}

/**
 * Lists all saved match history filenames.
 */
export function listSavedMatches(): string[] {
  try {
    if (!fs.existsSync(HISTORY_DIR)) return [];
    const files = fs.readdirSync(HISTORY_DIR);
    return files.filter((f) => f.endsWith(".json"));
  } catch (err) {
    console.error("Error listing saved matches:", err);
    return [];
  }
}

/**
 * Loads and parses a saved match history file.
 */
export function loadSavedMatch(fileName: string): any | null {
  try {
    const filePath = path.join(HISTORY_DIR, fileName);
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error loading saved match ${fileName}:`, err);
    return null;
  }
}
