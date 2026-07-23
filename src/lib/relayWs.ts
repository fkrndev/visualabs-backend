import { createBunWebSocket } from "hono/bun";

/**
 * Satu instance Bun WebSocket dipakai bersama oleh semua route WS relay dan
 * oleh bootstrap Bun (`export default { websocket }` di src/index.ts).
 * Harus SATU instance — Bun butuh satu `websocket` handler global.
 */
export const { upgradeWebSocket, websocket } = createBunWebSocket();
