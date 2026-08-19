/**
 * Relay Hub — registry node + routing frame antara browser (client) dan
 * node Hermes. Relay TIDAK memahami isi frame tui_gateway; ia hanya
 * meng-multiplex banyak sesi browser lewat satu koneksi node (passthrough).
 *
 * Wire relay ⇄ node-agent (JSON):
 *   relay → node : {t:"o", ch}                buka channel (client baru)
 *                  {t:"f", ch, d:"<frame>"}    teruskan frame client
 *                  {t:"c", ch}                 tutup channel
 *   node  → relay: {t:"f", ch, d:"<frame>"}    frame dari Hermes lokal
 *                  {t:"c", ch}                 channel ditutup di sisi node
 *
 * client ⇄ relay: frame tui_gateway JSON-RPC mentah (persis /api/ws).
 */

import { db } from "../db/client";
import { users, profiles } from "../db/schema";
import { inArray, eq } from "drizzle-orm";

export type NodeSummary = { id: string; label: string; online: boolean; sessions: number };

/**
 * Bentuk `node_id`: `node-{userId}` atau `node-{userId}-{namaMesin}`.
 *
 * Akhiran mesin ditambahkan supaya satu orang bisa memakai lebih dari satu
 * laptop. Tanpa itu keduanya mendaftar dengan id yang sama, dan
 * `registerNode()` memperlakukan pendaftaran kedua sebagai "node yang sama
 * connect ulang" — menutup yang pertama berikut seluruh channel-nya. Hasilnya
 * dua laptop saling menendang tanpa henti, bukan sekadar salah satu kalah.
 *
 * Bentuk lama tetap diterima: VBOX versi lama masih mengirimkannya, dan node
 * yang tidak bisa membaca nama mesinnya sendiri sengaja jatuh ke sana.
 */
export const NODE_ID_RE = /^node-(\d+)(?:-([a-z0-9-]+))?$/;

/**
 * Label yang tampil di dropdown "pilih Hermes server".
 *
 * Dipisah dari `listNodes()` supaya bisa diuji tanpa database — logikanya
 * kecil tapi bercabang tiga, dan salahnya baru ketahuan sebagai dropdown
 * membingungkan di produksi.
 */
export function nodeDisplayLabel(nodeId: string, rawLabel: string, userName?: string): string {
    if (!userName) return rawLabel;

    // Nama mesin ditempel HANYA kalau id-nya memang membawa akhiran mesin,
    // supaya node lama (`node-5`) tampil persis seperti dulu.
    const hasMachine = !!NODE_ID_RE.exec(nodeId)?.[2];
    if (!hasMachine) return userName;

    // `rawLabel` jatuh ke nodeId kalau node tidak mengirim label; menempelkan
    // itu cuma mengulang id yang sudah tampil di tempat lain.
    if (!rawLabel || rawLabel === nodeId) return userName;

    return `${userName} · ${rawLabel}`;
}

export interface ClientHandle {
    ch: string;
    send: (data: string) => void;
    close: () => void;
}

export interface NodeHandle {
    nodeId: string;
    label: string;
    send: (data: string) => void;
    channels: Map<string, ClientHandle>;
    lastSeen: number;
}

type PendingMcp = {
    resolve: (resp: { status: number; data: unknown }) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
};

class RelayHub {
    private nodes = new Map<string, NodeHandle>();
    private pendingMcp = new Map<string, PendingMcp>();
    private mcpReqCounter = 0;

    registerNode(node: NodeHandle): void {
        // Node id yang sama connect ulang → tutup channel lama dulu.
        const existing = this.nodes.get(node.nodeId);
        if (existing) this.dropNode(existing);
        this.nodes.set(node.nodeId, node);
    }

    unregisterNode(nodeId: string): void {
        const node = this.nodes.get(nodeId);
        if (node) this.dropNode(node);
    }

    private dropNode(node: NodeHandle): void {
        for (const client of node.channels.values()) {
            try {
                client.close();
            } catch {
                /* ignore */
            }
        }
        node.channels.clear();
        this.nodes.delete(node.nodeId);
    }

    async listNodes(): Promise<NodeSummary[]> {
        const nodes = [...this.nodes.values()];
        // Resolve user names from DB for node IDs matching "node-{userId}"
        const userIds = nodes
            .map((n) => NODE_ID_RE.exec(n.nodeId)?.[1])
            .filter((id): id is string => !!id)
            .map(Number);

        let nameMap = new Map<number, string>();
        if (userIds.length) {
            const rows = await db
                .select({ id: users.id, name: profiles.name, username: users.username })
                .from(users)
                .leftJoin(profiles, eq(profiles.userId, users.id))
                .where(inArray(users.id, userIds));
            for (const r of rows) {
                const label = r.name || r.username || `User ${r.id}`;
                nameMap.set(r.id, label);
            }
        }

        return nodes.map((n) => {
            const match = NODE_ID_RE.exec(n.nodeId);
            const userId = match ? Number(match[1]) : null;
            const userName = userId ? nameMap.get(userId) : undefined;
            const label = nodeDisplayLabel(n.nodeId, n.label, userName);
            return {
                id: n.nodeId,
                label,
                online: true,
                sessions: n.channels.size,
            };
        });
    }

    hasNode(nodeId: string): boolean {
        return this.nodes.has(nodeId);
    }

    /** Client browser attach → relay minta node buka channel baru. */
    attachClient(nodeId: string, client: ClientHandle): boolean {
        const node = this.nodes.get(nodeId);
        if (!node) return false;
        node.channels.set(client.ch, client);
        node.send(JSON.stringify({ t: "o", ch: client.ch }));
        return true;
    }

    /** Frame dari client → node (dibungkus channel). */
    clientFrame(nodeId: string, ch: string, raw: string): void {
        const node = this.nodes.get(nodeId);
        if (!node) return;
        node.send(JSON.stringify({ t: "f", ch, d: raw }));
    }

    /** Client browser disconnect → beri tahu node tutup channel. */
    detachClient(nodeId: string, ch: string): void {
        const node = this.nodes.get(nodeId);
        if (!node) return;
        if (node.channels.delete(ch)) node.send(JSON.stringify({ t: "c", ch }));
    }

    /** Kirim MCP query ke node (HTTP proxy ke Hermes lokal). */
    sendMcpRequest(
        nodeId: string,
        method: string,
        path: string,
        body?: unknown,
    ): Promise<{ status: number; data: unknown }> {
        const node = this.nodes.get(nodeId);
        if (!node) return Promise.reject(new Error("node offline"));

        const reqId = `mcp-${++this.mcpReqCounter}`;
        return new Promise((resolve, reject) => {
            const timeoutMs = path.includes("/test") ? 120_000 : 30_000;
            const timer = setTimeout(() => {
                this.pendingMcp.delete(reqId);
                reject(new Error(`MCP request timeout (${timeoutMs / 1000}s)`));
            }, timeoutMs);

            this.pendingMcp.set(reqId, { resolve, reject, timer });
            node.send(JSON.stringify({ t: "mcp_req", reqId, method, path, body: body ?? null }));
        });
    }

    /** Pesan dari node → relay: teruskan frame ke client pemilik channel. */
    onNodeMessage(nodeId: string, raw: string): void {
        const node = this.nodes.get(nodeId);
        if (!node) return;
        node.lastSeen = Date.now();

        let m: { t?: string; ch?: string; d?: unknown; reqId?: string; status?: number; data?: unknown };
        try {
            m = JSON.parse(raw);
        } catch {
            return;
        }

        if (m.t === "f" && typeof m.ch === "string") {
            const client = node.channels.get(m.ch);
            if (client) client.send(typeof m.d === "string" ? m.d : JSON.stringify(m.d));
        } else if (m.t === "c" && typeof m.ch === "string") {
            const client = node.channels.get(m.ch);
            if (client) {
                try {
                    client.close();
                } catch {
                    /* ignore */
                }
            }
            node.channels.delete(m.ch);
        } else if (m.t === "mcp_resp" && typeof m.reqId === "string") {
            const pending = this.pendingMcp.get(m.reqId);
            if (pending) {
                clearTimeout(pending.timer);
                this.pendingMcp.delete(m.reqId);
                pending.resolve({ status: m.status ?? 200, data: m.data });
            }
        }
        // {t:"ready"} / ping lain → diabaikan
    }
}

export const hub = new RelayHub();
