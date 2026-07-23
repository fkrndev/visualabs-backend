/**
 * Node-agent — jalan di HOST Hermes. DIAL KELUAR ke relay dan mem-pipe
 * `/api/ws` lokal Hermes. Dengan ini node Hermes cukup `serve` di 127.0.0.1
 * (tetap CLIENT, tanpa membuka inbound publik / domain / TLS per node).
 *
 * Alur:
 *   relay {t:"o",ch}  → buka WS lokal baru ke Hermes, map ke channel
 *   relay {t:"f",ch}  → teruskan frame ke WS lokal channel itu
 *   relay {t:"c",ch}  → tutup WS lokal channel
 *   WS lokal message  → relay {t:"f",ch,d:<frame>}
 *   WS lokal close    → relay {t:"c",ch}
 *
 * Env:
 *   RELAY_WS_URL   base relay, mis. wss://host/api/relay  (connect ke <base>/node)
 *   NODE_ID        id unik node
 *   NODE_TOKEN     token register (= RELAY_NODE_TOKEN di server relay)
 *   NODE_LABEL     label tampil (default = NODE_ID)
 *   LOCAL_WS_URL   default ws://127.0.0.1:9119/api/ws
 *   LOCAL_TOKEN    = HERMES_DASHBOARD_SESSION_TOKEN yang dipakai `hermes serve`
 *
 * Jalankan (di host Hermes): bun run src/relay/node-agent.ts
 */

const RELAY_WS_URL = (process.env.RELAY_WS_URL || "ws://127.0.0.1:2024/api/relay").replace(/\/+$/, "");
const NODE_ID = process.env.NODE_ID || "node-1";
const NODE_TOKEN = process.env.NODE_TOKEN || "";
const NODE_LABEL = process.env.NODE_LABEL || NODE_ID;
const LOCAL_WS_URL = process.env.LOCAL_WS_URL || "ws://127.0.0.1:9119/api/ws";
const LOCAL_TOKEN = process.env.LOCAL_TOKEN || process.env.HERMES_DASHBOARD_SESSION_TOKEN || "";

interface Chan {
    ws: WebSocket;
    open: boolean;
    queue: string[];
}

const channels = new Map<string, Chan>();
let relay: WebSocket | null = null;
let backoff = 500;

function log(...a: unknown[]): void {
    console.log(`[node-agent ${NODE_ID}]`, ...a);
}

function localUrl(): string {
    if (!LOCAL_TOKEN) return LOCAL_WS_URL;
    const sep = LOCAL_WS_URL.includes("?") ? "&" : "?";
    return `${LOCAL_WS_URL}${sep}token=${encodeURIComponent(LOCAL_TOKEN)}`;
}

function openChannel(ch: string): void {
    const ws = new WebSocket(localUrl());
    const st: Chan = { ws, open: false, queue: [] };
    channels.set(ch, st);
    ws.addEventListener("open", () => {
        st.open = true;
        for (const q of st.queue) ws.send(q);
        st.queue.length = 0;
    });
    ws.addEventListener("message", (e) => {
        const d = typeof e.data === "string" ? e.data : String(e.data);
        relay?.send(JSON.stringify({ t: "f", ch, d }));
    });
    ws.addEventListener("close", () => {
        channels.delete(ch);
        relay?.send(JSON.stringify({ t: "c", ch }));
    });
    ws.addEventListener("error", () => {
        /* close menyusul */
    });
}

function frameToChannel(ch: string, d: string): void {
    const st = channels.get(ch);
    if (!st) return;
    if (st.open) st.ws.send(d);
    else st.queue.push(d);
}

function closeChannel(ch: string): void {
    const st = channels.get(ch);
    channels.delete(ch);
    if (st) {
        try {
            st.ws.close();
        } catch {
            /* ignore */
        }
    }
}

function connect(): void {
    const url =
        `${RELAY_WS_URL}/node?token=${encodeURIComponent(NODE_TOKEN)}` +
        `&node_id=${encodeURIComponent(NODE_ID)}&label=${encodeURIComponent(NODE_LABEL)}`;
    relay = new WebSocket(url);

    relay.addEventListener("open", () => {
        backoff = 500;
        log("connected to relay");
    });
    relay.addEventListener("message", (e) => {
        const raw = typeof e.data === "string" ? e.data : String(e.data);
        let m: { t?: string; ch?: string; d?: unknown; node_id?: string };
        try {
            m = JSON.parse(raw);
        } catch {
            return;
        }
        if (m.t === "ready") return void log("registered as", m.node_id);
        if (m.t === "o" && m.ch) return openChannel(m.ch);
        if (m.t === "f" && m.ch) return frameToChannel(m.ch, typeof m.d === "string" ? m.d : JSON.stringify(m.d));
        if (m.t === "c" && m.ch) return closeChannel(m.ch);
    });
    relay.addEventListener("close", () => {
        for (const ch of [...channels.keys()]) closeChannel(ch);
        log("relay closed; reconnect in", backoff, "ms");
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 15000);
    });
    relay.addEventListener("error", () => {
        try {
            relay?.close();
        } catch {
            /* ignore */
        }
    });
}

log("starting — relay:", RELAY_WS_URL, "local:", LOCAL_WS_URL, LOCAL_TOKEN ? "(token set)" : "(no token)");
connect();
