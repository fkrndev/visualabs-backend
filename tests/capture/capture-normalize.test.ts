import { describe, it, expect } from 'vitest';
import {
	cleanQuery,
	endpointKeyOf,
	isDeniedParam,
	parseCaptureUrl,
	platformOf,
	shouldStoreBody,
	MAX_PAYLOAD_BYTES,
} from '../../src/utils/capture';

/**
 * Yang diuji di sini bukan happy path-nya, melainkan tiga hal yang kalau salah
 * merusak data diam-diam:
 *
 *   1. URL kedua platform penuh parameter yang berubah tiap request. Kalau ikut
 *      masuk ke endpoint_key, katalog berisi ribuan endpoint palsu.
 *   2. Query TikTok memuat token anti-bot dan sidik jari perangkat staff. Kalau
 *      lolos saringan, semuanya tersimpan di basis data.
 *   3. oec_seller_id harus dibaca ulang tiap request, karena satu akun TikTok
 *      bisa berpindah toko tanpa memuat ulang halaman.
 *
 * URL di bawah disalin dari hasil sadapan nyata 28 Agustus 2026.
 */

const SHOPEE_URL =
	'https://seller.shopee.co.id/api/mydata/v2/homepage/key-metrics/?SPC_CDS=203e9f78-b62e-4369-9791-f728735fcbf6&SPC_CDS_VER=2&order_type=confirmed';

const TIKTOK_URL =
	'https://seller-id.tokopedia.com/api/v2/insights/seller/ttp/seller_center/homepage/stats' +
	'?locale=id-ID&language=id&oec_seller_id=7494083445777663262&seller_id=7494083445777663262' +
	'&aid=4068&app_name=i18n_ecom_shop&fp=verify_mqpys27u_vQh9ACG4&device_platform=web' +
	'&cookie_enabled=true&screen_width=1440&screen_height=900&browser_language=en-US' +
	'&browser_platform=MacIntel&browser_name=Mozilla&timezone_name=Asia%2FJakarta' +
	'&msToken=&X-Bogus=DFSzswROJ98dUA7hCwfaDGVxWZyT&X-Gnarly=MwHz2GMS5HruBQYD&X-Tts-Oec-Bsid=9a8c0000';

describe('platformOf', () => {
	it('hanya mengenali host marketplace', () => {
		expect(platformOf('seller.shopee.co.id')).toBe('shopee');
		expect(platformOf('seller-id.tokopedia.com')).toBe('tiktok');
		// CDN dan telemetri harus ditolak — di satu kali buka halaman, merekalah
		// mayoritasnya (302 response Shopee, hanya 82 yang API seller).
		expect(platformOf('deo.shopeemobile.com')).toBeNull();
		expect(platformOf('mon.tiktokv.com')).toBeNull();
		expect(platformOf('libraweb.tiktok.com')).toBeNull();
	});
});

describe('endpointKeyOf', () => {
	it('membuang query dan garis miring di ujung', () => {
		expect(endpointKeyOf(new URL(SHOPEE_URL))).toBe(
			'seller.shopee.co.id/api/mydata/v2/homepage/key-metrics'
		);
	});

	it('menghasilkan kunci yang sama walau parameter sesi berubah', () => {
		const a = endpointKeyOf(new URL(SHOPEE_URL));
		const b = endpointKeyOf(new URL(SHOPEE_URL.replace('203e9f78-b62e-4369-9791-f728735fcbf6', 'ffffffff-0000-0000-0000-000000000000')));
		expect(a).toBe(b);
	});

	it('tidak melebihi lebar kolom varchar(255)', () => {
		const long = new URL(`https://seller.shopee.co.id/api/${'a'.repeat(400)}`);
		expect(endpointKeyOf(long).length).toBe(255);
	});
});

describe('isDeniedParam', () => {
	it('menolak token rahasia dan sidik jari perangkat', () => {
		for (const p of [
			'msToken',
			'X-Bogus',
			'X-Gnarly',
			'X-Tts-Oec-Bsid',
			'fp',
			'SPC_CDS',
			'screen_width',
			'browser_version',
			'device_platform',
			'_cache_api_sw_v1_',
		]) {
			expect(isDeniedParam(p), `${p} seharusnya ditolak`).toBe(true);
		}
	});

	it('meloloskan parameter yang menentukan arti data', () => {
		for (const p of ['oec_seller_id', 'group', 'offset', 'order_type', 'language']) {
			expect(isDeniedParam(p), `${p} seharusnya lolos`).toBe(false);
		}
	});
});

describe('cleanQuery', () => {
	it('menyaring habis parameter rahasia TikTok', () => {
		const q = cleanQuery(new URL(TIKTOK_URL))!;
		expect(q.oec_seller_id).toBe('7494083445777663262');
		expect(q.language).toBe('id');
		for (const k of Object.keys(q)) {
			expect(isDeniedParam(k), `${k} lolos saringan`).toBe(false);
		}
		expect(q.msToken).toBeUndefined();
		expect(q['X-Bogus']).toBeUndefined();
		expect(q.screen_width).toBeUndefined();
	});

	it('mengembalikan null kalau tidak ada parameter yang tersisa', () => {
		expect(cleanQuery(new URL('https://seller.shopee.co.id/api/x?SPC_CDS=1&timestamp=2'))).toBeNull();
	});
});

describe('parseCaptureUrl', () => {
	it('membaca oec_seller_id sebagai shopId', () => {
		expect(parseCaptureUrl(TIKTOK_URL)?.shopId).toBe('7494083445777663262');
	});

	it('shopId kosong untuk Shopee — identitas datang dari profil Chrome', () => {
		const p = parseCaptureUrl(SHOPEE_URL)!;
		expect(p.platform).toBe('shopee');
		expect(p.shopId).toBeNull();
	});

	it('mengembalikan null untuk host di luar daftar dan URL rusak', () => {
		expect(parseCaptureUrl('https://mon.tiktokv.com/monitor_browser/collect/batch/')).toBeNull();
		expect(parseCaptureUrl('bukan-url')).toBeNull();
	});
});

describe('shouldStoreBody', () => {
	const enabled = new Set(['shopee seller.shopee.co.id/api/mydata/v2/homepage/key-metrics']);

	it('menyimpan isi hanya untuk endpoint yang dinyalakan', () => {
		expect(
			shouldStoreBody('{"a":1}', 'shopee', 'seller.shopee.co.id/api/mydata/v2/homepage/key-metrics', enabled)
		).toBe(true);
	});

	it('menolak endpoint yang tidak dinyalakan — termasuk halaman pesanan', () => {
		expect(shouldStoreBody('{"pembeli":"..."}', 'shopee', 'seller.shopee.co.id/api/order/list', enabled)).toBe(
			false
		);
	});

	it('tidak tertukar antar platform walau path-nya sama', () => {
		expect(
			shouldStoreBody('{"a":1}', 'tiktok', 'seller.shopee.co.id/api/mydata/v2/homepage/key-metrics', enabled)
		).toBe(false);
	});

	it('melewati response yang kelewat besar', () => {
		const big = 'x'.repeat(MAX_PAYLOAD_BYTES + 1);
		expect(
			shouldStoreBody(big, 'shopee', 'seller.shopee.co.id/api/mydata/v2/homepage/key-metrics', enabled)
		).toBe(false);
	});

	it('tanpa isi berarti hanya masuk katalog', () => {
		expect(
			shouldStoreBody(undefined, 'shopee', 'seller.shopee.co.id/api/mydata/v2/homepage/key-metrics', enabled)
		).toBe(false);
	});
});
