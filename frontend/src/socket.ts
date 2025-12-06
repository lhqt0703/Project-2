import { io } from "socket.io-client";
export const socket = io("http://localhost:3001");
// Kết nối tới backend tại địa chỉ localhost:3001