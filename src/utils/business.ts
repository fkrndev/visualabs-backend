/**
 * Helper untuk mendapatkan businessId berdasarkan origin
 */
export function getBusinessIdFromOrigin(origin: string | null): number {
  // Default businessId
  let businessId = 1;

  if (!origin) {
    return businessId;
  }

  // Mapping domain ke businessId
  const domainMapping: Record<string, number> = {
    'http://localhost:3005': 1,
    'http://127.0.0.1:3005': 1,
    // Tambahkan mapping domain lain di sini
    // 'https://yourdomain.com': 2,
  };

  // Cek apakah origin ada di mapping
  if (domainMapping[origin]) {
    businessId = domainMapping[origin];
  }

  return businessId;
}
