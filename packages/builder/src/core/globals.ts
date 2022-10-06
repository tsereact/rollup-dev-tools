export type GlobalWebSocket = WebSocket;
export const GlobalWebSocket = typeof WebSocket === "function" ? WebSocket : false;
