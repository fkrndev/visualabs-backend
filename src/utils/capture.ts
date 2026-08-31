import { createHash } from 'crypto';

/**
 * Fungsi murni untuk capture data marketplace. Rencana: docs/vbox/capture-plan.md
 *
 * Dipisah dari route-nya karena di sinilah semua keputusan yang bisa salah
 * berada — penentuan platform, pembersihan URL, dan penyaringan parameter
 * rahasia. Semuanya bisa diuji tanpa basis data (tests/capture/).
 */

/** Host yang boleh disadap. Selain ini diabaikan, termasuk CDN dan telemetri. */
export const PLATFORM_BY_HOST: Record<string, string> = {
	'seller.shopee.co.id': 'shopee',
	'seller.shopee.sg': 'shopee',
	'seller-id.tokopedia.com': 'tiktok',
};

export const platformOf = (host: string): string | null => PLATFORM_BY_HOST[host] ?? null;

/**
 * Parameter yang TIDAK boleh ikut tersimpan.
 *
 * Dua alasan berbeda tercampur di sini dan keduanya penting:
 *   - rahasia: `msToken`, `X-Tts-Oec-Bsid`, `X-Bogus`, `X-Gnarly` adalah token
 *     anti-bot TikTok; `SPC_CDS` adalah id sesi Shopee
 *   - sidik jari perangkat staff: `screen_*`, `browser_*`, `device_platform`
 *
 * Sisanya (`oec_seller_id`, `group`, `offset`, `order_type`) justru menentukan
 * arti datanya, jadi wajib disimpan.
 */
const DENY_EXACT = new Set([
	'mstoken',
	'fp',
	'device_platform',
	'cookie_enabled',
	'timezone_name',
	'spc_cds',
	'spc_cds_ver',
	'timestamp',
	'requestid',
	'aid',
	'app_name',
]);

const DENY_PREFIX = ['x-', 'browser_', 'screen_', '_cache_'];

export const isDeniedParam = (name: string): boolean => {
	const n = name.toLowerCase();
	return DENY_EXACT.has(n) || DENY_PREFIX.some((p) => n.startsWith(p));
};

/** host + pathname, tanpa query dan tanpa garis miring di ujung. */
export const endpointKeyOf = (url: URL): string => {
	const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
	// Kolomnya varchar(255). Endpoint asli terpanjang yang pernah terlihat 93
	// karakter, jadi pemotongan ini praktis tidak pernah terjadi — ia hanya
	// mencegah URL aneh menggagalkan insert.
	return `${url.host}${path}`.slice(0, 255);
};

export const cleanQuery = (url: URL): Record<string, string> | null => {
	const out: Record<string, string> = {};
	for (const [k, v] of url.searchParams) {
		if (!isDeniedParam(k)) out[k] = v;
	}
	return Object.keys(out).length ? out : null;
};

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

/** Di atas ini isi response dilewati. Lihat MAX_PAYLOAD_BYTES di route. */
export const MAX_PAYLOAD_BYTES = 256 * 1024;

/**
 * Menentukan apakah isi sebuah response boleh disimpan.
 *
 * Ini penjaga terpenting di seluruh alur. Extension memang sudah menyaring lebih
 * dulu, tetapi daftar aturannya bisa basi beberapa menit setelah sebuah endpoint
 * dimatikan — dan selama jeda itu isinya tidak boleh terlanjur masuk. Endpoint
 * yang memuat data pribadi pembeli (halaman pesanan) dimatikan lewat saklar yang
 * sama, jadi kalau penjaga ini bocor, yang ikut tersimpan bukan cuma sampah.
 */
export const shouldStoreBody = (
	body: string | undefined,
	platform: string,
	endpointKey: string,
	enabled: Set<string>
): boolean => {
	if (!body) return false;
	if (!enabled.has(`${platform} ${endpointKey}`)) return false;
	if (body.length > MAX_PAYLOAD_BYTES) return false;
	return true;
};

export type ParsedCapture = {
	platform: string;
	endpointKey: string;
	query: Record<string, string> | null;
	shopId: string | null;
};

/**
 * Membaca satu URL hasil sadapan. Mengembalikan null kalau host-nya di luar
 * daftar — pemanggil memakai itu untuk membuang item tanpa memeriksa apa pun lagi.
 */
export const parseCaptureUrl = (rawUrl: string): ParsedCapture | null => {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}
	const platform = platformOf(url.host);
	if (!platform) return null;

	const query = cleanQuery(url);
	// TikTok menempelkan oec_seller_id di query hampir setiap request, dan satu
	// akun bisa berpindah toko tanpa memuat ulang halaman — jadi dibaca ulang tiap
	// kali, bukan sekali di awal. Shopee tidak punya padanannya di query.
	const shopId = query?.oec_seller_id ?? null;

	return { platform, endpointKey: endpointKeyOf(url), query, shopId };
};
