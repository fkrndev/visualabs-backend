import { describe, expect, it } from "vitest";

import { NODE_ID_RE, nodeDisplayLabel } from "../../src/relay/hub";

/**
 * Satu orang boleh memakai lebih dari satu laptop. Sebelum ini `node_id`
 * diturunkan murni dari user id, jadi laptop kedua mendaftar dengan id yang
 * sama dan `registerNode()` menutup pendaftaran pertama berikut seluruh
 * channel-nya — dua laptop saling menendang tanpa henti.
 *
 * Bentuk lama harus tetap diterima: VBOX versi lama masih mengirimkannya.
 */
describe("NODE_ID_RE", () => {
	it("menerima bentuk lama tanpa akhiran mesin", () => {
		const m = NODE_ID_RE.exec("node-2");
		expect(m?.[1]).toBe("2");
		expect(m?.[2]).toBeUndefined();
	});

	it("menerima bentuk baru dengan akhiran mesin", () => {
		const m = NODE_ID_RE.exec("node-2-laptop-qj2mjp45");
		expect(m?.[1]).toBe("2");
		expect(m?.[2]).toBe("laptop-qj2mjp45");
	});

	it("menolak id yang tidak menunjuk user", () => {
		// Tanpa penolakan ini, `listNodes()` mencari user id NaN di database.
		expect(NODE_ID_RE.exec("node-abc")).toBeNull();
		expect(NODE_ID_RE.exec("node-")).toBeNull();
		// Akhiran kosong = mesin yang tidak teridentifikasi; jangan diloloskan.
		expect(NODE_ID_RE.exec("node-2-")).toBeNull();
		// Huruf besar tidak diloloskan — VBOX selalu mengirim slug huruf kecil,
		// jadi id ber-huruf besar berarti ada yang salah di hulu.
		expect(NODE_ID_RE.exec("node-2-LAPTOP")).toBeNull();
	});
});

describe("nodeDisplayLabel", () => {
	it("node lama tetap menampilkan nama orang saja", () => {
		expect(nodeDisplayLabel("node-2", "LAPTOP-QJ2MJP45", "Saiful")).toBe("Saiful");
	});

	it("node bermesin menampilkan nama orang dan mesinnya", () => {
		expect(nodeDisplayLabel("node-2-laptop-qj2mjp45", "LAPTOP-QJ2MJP45", "Saiful")).toBe(
			"Saiful · LAPTOP-QJ2MJP45",
		);
	});

	it("dua laptop milik orang yang sama bisa dibedakan", () => {
		const a = nodeDisplayLabel("node-2-laptop-qj2mjp45", "LAPTOP-QJ2MJP45", "Saiful");
		const b = nodeDisplayLabel("node-2-mac-mini", "MAC-MINI", "Saiful");
		expect(a).not.toBe(b);
	});

	it("tidak mengulang node id ketika label tidak dikirim node", () => {
		const id = "node-2-laptop-qj2mjp45";
		expect(nodeDisplayLabel(id, id, "Saiful")).toBe("Saiful");
	});

	it("jatuh ke label mentah kalau nama user tidak ketemu di database", () => {
		expect(nodeDisplayLabel("node-99-pc", "PC-GUDANG", undefined)).toBe("PC-GUDANG");
	});
});
