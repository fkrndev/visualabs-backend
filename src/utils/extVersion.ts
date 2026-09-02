import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { chromeProfiles } from '../db/schema';

/**
 * Mencatat versi extension yang sedang berjalan di sebuah profil Chrome.
 *
 * Dipanggil dari route yang MEMANG sudah dihubungi extension setiap hari
 * (`/chrome-histories/track` dan `/capture`), jadi tidak perlu heartbeat sendiri.
 *
 * Kenapa bukan mencatat siapa yang mengunduh di `/api/extension/zip`: terunduh
 * belum tentu terpasang — VBOX baru menerapkannya pada peluncuran berikutnya, dan
 * ekstraksi bisa gagal. Laporan ini hanya mungkin dikirim oleh extension yang
 * benar-benar hidup, jadi ia membuktikan versinya berjalan, bukan sekadar ada.
 *
 * Gagalnya diabaikan: ini data pengamatan, tidak boleh menjatuhkan permintaan
 * aslinya.
 */
export const recordExtVersion = async (
	profileId: number,
	version: string | undefined
): Promise<void> => {
	if (!version) return;
	try {
		await db
			.update(chromeProfiles)
			.set({ extVersion: version.slice(0, 20), extSeenAt: new Date() })
			.where(eq(chromeProfiles.id, profileId));
	} catch {
		// abaikan
	}
};
