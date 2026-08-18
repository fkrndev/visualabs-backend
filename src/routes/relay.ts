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

/**
 * Alasan penolakan — buat log saja, TIDAK pernah dikirim ke node.
 *
 * Node yang ditolak cuma menerima `1008 unauthorized`, jadi dari sisi node
 * "token saya salah" dan "server belum punya token sama sekali" terlihat
 * identik — dan yang kedua itu salah konfigurasi server, bukan salah user.
 * Tanpa baris ini keduanya sama-sama senyap di kedua ujung.
 */
function rejectReason(nodeId: string, token: string): string {
	if (!nodeId) return "node_id kosong";
	if (PER_NODE_TOKENS[nodeId]) return "token tidak cocok dengan entry RELAY_NODE_TOKENS node ini";
	if (!SHARED_NODE_TOKEN)
		return "RELAY_NODE_TOKEN belum diset di server — semua node akan ditolak apa pun tokennya";
	if (!token) return "node tidak mengirim token";
	return "token tidak cocok dengan RELAY_NODE_TOKEN";
}

// ── Daftar node online (buat dropdown "pilih Hermes server" di FE) ──────────
router.get("/nodes", requireAuthWithFallback, async (c) => {
    return c.json({ success: true, data: await hub.listNodes() });
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
                    console.warn(
                        `[relay] node '${nodeId || "(kosong)"}' ditolak: ${rejectReason(nodeId, token)}`,
                    );
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

// ── MCP proxy: list servers & trigger auth on a node ────────────────────────
router.get("/mcp/:nodeId/servers", requireAuthWithFallback, async (c) => {
    const nodeId = c.req.param("nodeId");
    if (!hub.hasNode(nodeId)) return c.json({ error: "node offline" }, 503);
    try {
        const resp = await hub.sendMcpRequest(nodeId, "GET", "/api/mcp/servers");
        return c.json(resp.data, resp.status as any);
    } catch (err) {
        return c.json({ error: (err as Error).message }, 502);
    }
});

router.post("/mcp/:nodeId/servers/:name/auth", requireAuthWithFallback, async (c) => {
    const nodeId = c.req.param("nodeId");
    const serverName = c.req.param("name");
    if (!hub.hasNode(nodeId)) return c.json({ error: "node offline" }, 503);
    try {
        const body = await c.req.json().catch(() => ({}));
        const resp = await hub.sendMcpRequest(
            nodeId,
            "POST",
            `/api/mcp/servers/${encodeURIComponent(serverName)}/auth`,
            body,
        );
        return c.json(resp.data, resp.status as any);
    } catch (err) {
        return c.json({ error: (err as Error).message }, 502);
    }
});

// ── MCP server test (connect, list tools, disconnect) ──────────────────────
router.post("/mcp/:nodeId/servers/:name/test", requireAuthWithFallback, async (c) => {
    const nodeId = c.req.param("nodeId");
    const serverName = c.req.param("name");
    if (!hub.hasNode(nodeId)) return c.json({ error: "node offline" }, 503);
    try {
        const resp = await hub.sendMcpRequest(
            nodeId,
            "POST",
            `/api/mcp/servers/${encodeURIComponent(serverName)}/test`,
        );
        return c.json(resp.data, resp.status as any);
    } catch (err) {
        return c.json({ error: (err as Error).message }, 502);
    }
});

// ── MCP server create (add new server to node) ─────────────────────────────
router.post("/mcp/:nodeId/servers", requireAuthWithFallback, async (c) => {
    const nodeId = c.req.param("nodeId");
    if (!hub.hasNode(nodeId)) return c.json({ error: "node offline" }, 503);
    try {
        const body = await c.req.json();
        const resp = await hub.sendMcpRequest(
            nodeId,
            "POST",
            "/api/mcp/servers",
            body,
        );
        return c.json(resp.data, resp.status as any);
    } catch (err) {
        return c.json({ error: (err as Error).message }, 502);
    }
});

// ── MCP server delete (remove server from node) ────────────────────────────
router.delete("/mcp/:nodeId/servers/:name", requireAuthWithFallback, async (c) => {
    const nodeId = c.req.param("nodeId");
    const serverName = c.req.param("name");
    if (!hub.hasNode(nodeId)) return c.json({ error: "node offline" }, 503);
    try {
        const resp = await hub.sendMcpRequest(
            nodeId,
            "DELETE",
            `/api/mcp/servers/${encodeURIComponent(serverName)}`,
        );
        return c.json(resp.data, resp.status as any);
    } catch (err) {
        return c.json({ error: (err as Error).message }, 502);
    }
});

// ── Canva token check (check mcp-remote token without spawning process) ─────
router.get("/mcp/:nodeId/canva-token-check", requireAuthWithFallback, async (c) => {
    const nodeId = c.req.param("nodeId");
    if (!hub.hasNode(nodeId)) return c.json({ error: "node offline" }, 503);
    try {
        const resp = await hub.sendMcpRequest(
            nodeId,
            "GET",
            "/api/mcp/canva-token-check",
        );
        return c.json(resp.data, resp.status as any);
    } catch (err) {
        return c.json({ error: (err as Error).message }, 502);
    }
});

// ── Skills proxy: list, toggle, create, content, hub search/install/uninstall ──
router.get("/skills/:nodeId", requireAuthWithFallback, async (c) => {
    const nodeId = c.req.param("nodeId");
    if (!hub.hasNode(nodeId)) return c.json({ error: "node offline" }, 503);
    try {
        const resp = await hub.sendMcpRequest(nodeId, "GET", "/api/skills");
        return c.json(resp.data, resp.status as any);
    } catch (err) {
        return c.json({ error: (err as Error).message }, 502);
    }
});

router.put("/skills/:nodeId/toggle", requireAuthWithFallback, async (c) => {
    const nodeId = c.req.param("nodeId");
    if (!hub.hasNode(nodeId)) return c.json({ error: "node offline" }, 503);
    try {
        const body = await c.req.json().catch(() => ({}));
        const resp = await hub.sendMcpRequest(nodeId, "PUT", "/api/skills/toggle", body);
        return c.json(resp.data, resp.status as any);
    } catch (err) {
        return c.json({ error: (err as Error).message }, 502);
    }
});

router.get("/skills/:nodeId/content", requireAuthWithFallback, async (c) => {
    const nodeId = c.req.param("nodeId");
    if (!hub.hasNode(nodeId)) return c.json({ error: "node offline" }, 503);
    const name = c.req.query("name") ?? "";
    try {
        const resp = await hub.sendMcpRequest(nodeId, "GET", `/api/skills/content?name=${encodeURIComponent(name)}`);
        return c.json(resp.data, resp.status as any);
    } catch (err) {
        return c.json({ error: (err as Error).message }, 502);
    }
});

router.post("/skills/:nodeId", requireAuthWithFallback, async (c) => {
    const nodeId = c.req.param("nodeId");
    if (!hub.hasNode(nodeId)) return c.json({ error: "node offline" }, 503);
    try {
        const body = await c.req.json().catch(() => ({}));
        const resp = await hub.sendMcpRequest(nodeId, "POST", "/api/skills", body);
        return c.json(resp.data, resp.status as any);
    } catch (err) {
        return c.json({ error: (err as Error).message }, 502);
    }
});

router.put("/skills/:nodeId/content", requireAuthWithFallback, async (c) => {
    const nodeId = c.req.param("nodeId");
    if (!hub.hasNode(nodeId)) return c.json({ error: "node offline" }, 503);
    try {
        const body = await c.req.json().catch(() => ({}));
        const resp = await hub.sendMcpRequest(nodeId, "PUT", "/api/skills/content", body);
        return c.json(resp.data, resp.status as any);
    } catch (err) {
        return c.json({ error: (err as Error).message }, 502);
    }
});

router.get("/skills/:nodeId/hub/search", requireAuthWithFallback, async (c) => {
    const nodeId = c.req.param("nodeId");
    if (!hub.hasNode(nodeId)) return c.json({ error: "node offline" }, 503);
    const q = c.req.query("q") ?? "";
    const source = c.req.query("source") ?? "all";
    const limit = c.req.query("limit") ?? "20";
    try {
        const resp = await hub.sendMcpRequest(
            nodeId,
            "GET",
            `/api/skills/hub/search?q=${encodeURIComponent(q)}&source=${encodeURIComponent(source)}&limit=${limit}`,
        );
        return c.json(resp.data, resp.status as any);
    } catch (err) {
        return c.json({ error: (err as Error).message }, 502);
    }
});

router.post("/skills/:nodeId/hub/install", requireAuthWithFallback, async (c) => {
    const nodeId = c.req.param("nodeId");
    if (!hub.hasNode(nodeId)) return c.json({ error: "node offline" }, 503);
    try {
        const body = await c.req.json().catch(() => ({}));
        const resp = await hub.sendMcpRequest(nodeId, "POST", "/api/skills/hub/install", body);
        return c.json(resp.data, resp.status as any);
    } catch (err) {
        return c.json({ error: (err as Error).message }, 502);
    }
});

router.post("/skills/:nodeId/hub/uninstall", requireAuthWithFallback, async (c) => {
    const nodeId = c.req.param("nodeId");
    if (!hub.hasNode(nodeId)) return c.json({ error: "node offline" }, 503);
    try {
        const body = await c.req.json().catch(() => ({}));
        const resp = await hub.sendMcpRequest(nodeId, "POST", "/api/skills/hub/uninstall", body);
        return c.json(resp.data, resp.status as any);
    } catch (err) {
        return c.json({ error: (err as Error).message }, 502);
    }
});

router.get("/skills/:nodeId/hub/preview", requireAuthWithFallback, async (c) => {
    const nodeId = c.req.param("nodeId");
    if (!hub.hasNode(nodeId)) return c.json({ error: "node offline" }, 503);
    const identifier = c.req.query("identifier") ?? "";
    try {
        const resp = await hub.sendMcpRequest(
            nodeId,
            "GET",
            `/api/skills/hub/preview?identifier=${encodeURIComponent(identifier)}`,
        );
        return c.json(resp.data, resp.status as any);
    } catch (err) {
        return c.json({ error: (err as Error).message }, 502);
    }
});

export default router;
