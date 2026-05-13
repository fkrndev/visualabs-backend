# To-Do Deploy v-auto-backend (Hestia CP)

## 1. Persiapan via Hestia CP
- [x] Login ke panel Hestia CP.
- [x] Tambahkan domain/subdomain untuk backend (misal: `vims.dots.my.id`).
- [x] Aktifkan SSL Let's Encrypt dari panel.
- [x] Buat database MySQL baru via menu **DB** (catat user, password, nama db).
- [x] Pastikan Bun sudah terinstall di server: `curl -fsSL https://bun.sh/install | bash`.




## 2. Clone Project
- [x] SSH ke server pakai user Hestia (bukan root).
- [x] Masuk ke folder web user: `cd ~/web/api.domain.com/`.
- [x] Clone repo: `git clone <repo-url> app` (atau langsung ke `private/`).
- [x] Masuk folder project: `cd app`.
- [x] Install dependencies: `bun install`.

## 3. Konfigurasi Environment
- [ ] Buat file `.env` di root project.
- [ ] Isi semua variabel sesuai `SECURITY_ENV_VARIABLES.md`.
- [ ] Set `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` dari Hestia.
- [ ] Set `JWT_SECRET` dan API keys (Meta, Telegram, dll).
- [ ] Atur permission: `chmod 600 .env`.

## 4. Migrasi Database
- [ ] Jalankan migrasi: `bunx drizzle-kit migrate`.
- [ ] Cek tabel sudah ada via phpMyAdmin Hestia.
- [ ] (Opsional) Seed data awal jika perlu.

## 5. Jalankan Aplikasi (Background)
- [ ] Test run: `bun run src/index.ts` (pastikan tidak error).
- [ ] Catat port yang dipakai aplikasi (misal: 3000).
- [ ] Buat service systemd agar auto-restart & start saat reboot:
  - [ ] Buat file `/etc/systemd/system/v-auto-backend.service`.
  - [ ] Set `ExecStart=/home/<user>/.bun/bin/bun run src/index.ts`.
  - [ ] `sudo systemctl enable --now v-auto-backend`.
- [ ] Cek status: `sudo systemctl status v-auto-backend`.

## 6. Setup Reverse Proxy di Hestia
- [ ] Edit domain di Hestia → **Advanced Options**.
- [ ] Pilih template Nginx: `default` atau buat custom proxy template.
- [ ] Buat custom Nginx config di `/home/<user>/conf/web/<domain>/nginx.conf_custom`:
  - [ ] Arahkan `location /` → `proxy_pass http://127.0.0.1:<port>;`.
  - [ ] Tambahkan header `X-Forwarded-For`, `Host`, dll.
- [ ] Restart Nginx: `sudo systemctl reload nginx`.
- [ ] Test akses `https://api.domain.com`.

## 7. Setup Cron Jobs via Hestia
- [ ] Buka menu **Cron** di Hestia.
- [ ] Tambah job Meta Ads Report (sesuai jadwal yang diinginkan):
  - Command: `cd /home/<user>/web/api.domain.com/app && /home/<user>/.bun/bin/bun run scripts/run-meta-ads-report.ts`.
- [ ] Tambah job sync FB Act Balance (jika ada).
- [ ] Cek log eksekusi cron via panel.

## 8. Keamanan
- [ ] Pastikan `.env` di-`.gitignore` dan tidak ter-commit.
- [ ] Aktifkan auto-backup di Hestia (menu **Backup**).
- [ ] Cek firewall Hestia: hanya buka port 22, 80, 443.
- [ ] Disable SSH password login, pakai SSH key.

## 9. Finalisasi
- [ ] Test endpoint utama (login, dashboard, fb-act, dll) via Postman/browser.
- [ ] Cek log app: `journalctl -u v-auto-backend -f`.
- [ ] Cek log Nginx error: `/var/log/nginx/domains/<domain>.error.log`.
- [ ] Update URL backend di frontend / extension.
- [ ] Dokumentasikan info server & akses ke tim.
