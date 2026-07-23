import { Hono } from "hono";
import { verify } from "hono/jwt";

import { upgradeWebSocket } from "../lib/relayWs";
import { hub } from "../relay/hub";
import { JWT_SECRET, requireAuthWithFallback } from "../middleware/auth";

/**
 * Relay Hub — jembatan browser ⇄ node Hermes tanpa node membuka inbound.
 *
 * Endpoint (di belakang basePath "/api"):
 *   GET  /api/relay/nodes            (JWT user) → daftar node online
 *   WS   /api/relay/node             (RELAY_NODE_TOKEN) ← node-agent dial keluar
 *   WS   /api/relay/client?node=ID   (JWT user)         ← browser bubble chat
 *
 * Node & browser sama-sama DIAL KELUAR ke sini; hanya relay yang perlu reachable.
 */

const router = new Hono();

// Token node: per-node lewat RELAY_NODE_TOKENS (JSON {"node-a":"tok"}), atau
// fallback token bersama RELAY_NODE_TOKEN. Per-node lebih aman (bisa revoke 1 node).
const SHARED_NODE_TOKEN = process.env.RELAY_NODE_TOKEN || "";
let PER_NODE_TOKENS: Record<string, string> = {};
try {
	PER_NODE_TOKENS = process.env.RELAY_NODE_TOKENS ? JSON.parse(process.env.RELAY_NODE_TOKENS) : {};
} catch {
	PER_NODE_TOKENS = {};
}
function nodeTokenValid(nodeId: string, token: string): boolean {
	const expected = PER_NODE_TOKENS[nodeId];
	if (expected) return token === expected;
	return !!SHARED_NODE_TOKEN && token === SHARED_NODE_TOKEN;
}

// ── Daftar node online (buat dropdown "pilih Hermes server" di FE) ──────────
router.get("/nodes", requireAuthWithFallback, (c) => {
    return c.json({ success: true, data: hub.listNodes() });
});

// ── Node-agent connect keluar ke sini ──────────────────────────────────────
router.get(
    "/node",
    upgradeWebSocket((c) => {
        const token = c.req.query("token") || "";
        const nodeId = c.req.query("node_id") || "";
        const label = c.req.query("label") || nodeId;
        let registered = false;

        return {
            onOpen(_evt, ws) {
                if (!nodeId || !nodeTokenValid(nodeId, token)) {
                    ws.close(1008, "unauthorized");
                    return;
                }
                registered = true;
                hub.registerNode({
                    nodeId,
                    label,
                    send: (d) => ws.send(d),
                    channels: new Map(),
                    lastSeen: Date.now(),
                });
                ws.send(JSON.stringify({ t: "ready", node_id: nodeId }));
            },
            onMessage(evt) {
                if (!registered) return;
                const data = typeof evt.data === "string" ? evt.data : String(evt.data);
                hub.onNodeMessage(nodeId, data);
            },
            onClose() {
                if (registered) hub.unregisterNode(nodeId);
            },
        };
    }),
);

// ── Browser (bubble chat) connect keluar ke sini, pilih node ────────────────
router.get(
    "/client",
    upgradeWebSocket((c) => {
        const token = c.req.query("token") || "";
        const nodeId = c.req.query("node") || "";
        const ch =
            typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        let attached = false;

        return {
            async onOpen(_evt, ws) {
                // Auth: JWT user v-auto (sama seperti REST protected).
                try {
                    await verify(token, JWT_SECRET);
                } catch {
                    ws.close(1008, "unauthorized");
                    return;
                }
                if (!nodeId || !hub.hasNode(nodeId)) {
                    ws.send(
                        JSON.stringify({
                            type: "error",
                            payload: { message: `node '${nodeId}' tidak online` },
                        }),
                    );
                    ws.close(1011, "node offline");
                    return;
                }
                hub.attachClient(nodeId, {
                    ch,
                    send: (d) => ws.send(d),
                    close: () => {
                        try {
                            ws.close();
                        } catch {
                            /* ignore */
                        }
                    },
                });
                attached = true;
            },
            onMessage(evt) {
                if (!attached) return;
                const data = typeof evt.data === "string" ? evt.data : String(evt.data);
                hub.clientFrame(nodeId, ch, data);
            },
            onClose() {
                if (attached) hub.detachClient(nodeId, ch);
            },
        };
    }),
);

export default router;
