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

export type NodeSummary = { id: string; label: string; online: boolean; sessions: number };

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

class RelayHub {
    private nodes = new Map<string, NodeHandle>();

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

    listNodes(): NodeSummary[] {
        return [...this.nodes.values()].map((n) => ({
            id: n.nodeId,
            label: n.label,
            online: true,
            sessions: n.channels.size,
        }));
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

    /** Pesan dari node → relay: teruskan frame ke client pemilik channel. */
    onNodeMessage(nodeId: string, raw: string): void {
        const node = this.nodes.get(nodeId);
        if (!node) return;
        node.lastSeen = Date.now();

        let m: { t?: string; ch?: string; d?: unknown };
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
        }
        // {t:"ready"} / ping lain → diabaikan
    }
}

export const hub = new RelayHub();
