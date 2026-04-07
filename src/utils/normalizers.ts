export const cleanEmail = (raw: string): string => {
  const trimmed = raw.trim().toLowerCase();
  const [local, domain] = trimmed.split('@');
  if (!domain) {
    return trimmed.replace(/\./g, '');
  }
  const normalizedLocal = local.replace(/\./g, '');
  return `${normalizedLocal}@${domain}`;
};

export const cleanPhone = (raw: string): string => {
  // Hapus semua karakter kecuali digit
  let cleaned = raw.replace(/\D/g, '');
  
  // Jika dimulai dengan 0, ganti dengan 62
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }
  
  // Jika dimulai dengan 62, pastikan tidak ada + di depannya
  if (cleaned.startsWith('62')) {
    cleaned = cleaned.replace(/^62/, '62');
  }
  
  // Validasi minimal panjang (Indonesia minimal 10 digit setelah kode negara)
  if (cleaned.length < 6) {
    throw new Error('Nomor telepon terlalu pendek');
  }
  
  return cleaned;
};
