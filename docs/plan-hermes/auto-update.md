# Riset: bagaimana Hermes di laptop tim bisa selalu ter-update

Status: **D, A, dan prasyarat § 4 sudah dikerjakan** (10 Agustus 2026).
Lihat § 6 untuk apa yang nyata dibangun.

Pertanyaannya: kalau ada update `custom-hermes`, bagaimana caranya sampai ke
laptop setiap orang? Dokumen ini memetakan keadaan sekarang dulu, lalu opsi.

---

## 1. Keadaan sekarang

### Rantai distribusi

```
push ke custom-hermes
   ↓  (MANUAL — ssh ke server, git pull, bun run scripts/pack-hermes.ts)
storage/hermes/hermes-agent-<commit>.tar.gz + manifest.json
   ↓  GET /api/hermes/manifest   (commit, sha256, size)
VBOX: hermes_check_update() bandingkan .vbox_commit vs manifest.commit
   ↓  user menekan tombol Update
GET /api/hermes/tarball → extract → jalankan ulang stage install.sh
```

Tarball adalah snapshot beku satu commit; manifest hanya menunjuk satu versi.
Jadi selama tidak di-pack ulang, perubahan di repo tidak pernah ada bagi tim.

### Yang sudah jalan

- `hermes_check_update` (`hermes_install.rs:153`) — membandingkan commit lokal
  dengan manifest server, mengembalikan `available: false` diam-diam kalau
  backend mati / belum login / tarball belum ada.
- Badge kuning "Update tersedia → `<commit>`" di kartu Hermes Engine.
- Extract **tidak** menghapus isi direktori lebih dulu, jadi `venv/` dan
  `node_modules/` selamat — update tidak berarti build ulang dari nol.
- Tarball di-cache di `$HERMES_HOME/bootstrap-cache` dan di-skip kalau
  sha256-nya cocok.

### Yang belum

**a. Pengecekannya hanya jalan kalau user membuka halaman Settings.**
`refreshInstalled()` dipanggil di `useEffect` sekali saat `HermesControl`
mount (`Settings.tsx:115`), tanpa interval. Bandingkan dengan `hermes_status`
di komponen yang sama yang di-poll tiap 3 detik. Jadi orang yang tidak pernah
membuka Settings tidak akan pernah tahu ada update — persis masalah yang
`hermes_check_update` coba selesaikan, tapi berhenti satu langkah sebelum
garis akhir.

**b. Pack di server masih manual.** Tidak ada yang otomatis menjalankan
`pack-hermes.ts` setelah push. "Ada update" baru menjadi benar setelah ada
manusia yang ingat.

**c. Update = menjalankan ulang seluruh alur install**, lewat modal yang sama.
Tidak ada jalur ringan "cuma ganti source".

---

## 2. Bahaya yang ditemukan sambil riset

Ini bukan bagian dari pertanyaan, tapi menyangkut jalur update yang sama dan
sebaiknya diputuskan bersamaan.

### 2a. `hermes update` di Windows menimpa fork kita dengan Hermes upstream

`hermes_cli/main.py:9844` — kalau `PROJECT_ROOT/.git` tidak ada (dan install
VBOX memang tidak punya `.git`, karena sumbernya `git archive`):

| OS | Yang terjadi |
|---|---|
| macOS / Linux | `✗ Not a git repository. Please reinstall: curl … nousresearch.com/install.sh` lalu `exit 1` — buntu, dan sarannya salah untuk fork kita |
| **Windows** | `use_zip_update = True` → mengunduh `github.com/NousResearch/hermes-agent/archive/refs/heads/main.zip` lalu **menyalinnya di atas install tree** (`_update_via_zip`, `main.py:6304`) |

Di Windows itu berarti `custom-hermes` diganti Hermes upstream tanpa
peringatan. `venv`, `node_modules`, `.git`, `.env` dipertahankan; sisanya —
seluruh source, termasuk semua perubahan fork — ditimpa.

### 2b. Ada tiga pintu menuju perintah itu

1. `hermes update` di terminal.
2. `/update` di TUI (`gateway/slash_commands.py:4763`).
3. `POST /api/hermes/update` di dashboard Hermes (`web_server.py:3757`).

Yang ketiga paling perlu diperhatikan: endpoint itu **hanya memblokir
`docker`**, tidak memblokir `vbox-tarball`. Dan dashboard itu terjangkau dari
backend lewat relay — `sendMcpRequest()` mem-proxy path apa pun ke
`127.0.0.1:9119` (`relay_node.py:206`), tidak ada allowlist path.

`GET /api/hermes/update/check` sendiri sudah benar (`can_apply` hanya untuk
`git`/`pip`, jadi `vbox-tarball` → `false`), tapi tombolnya yang dijaga,
bukan endpoint-nya.

### 2c. Banner Hermes akan menampilkan "update available" yang palsu

`check_for_updates()` (`banner.py:296`): tidak ada `.git` → jatuh ke
`check_via_pypi()`, yang membandingkan versi lokal dengan paket
`hermes-agent` di PyPI. Itu proyek upstream, sama sekali bukan patokan kita.
Hasilnya banner CLI dan badge TUI mengajak update ke jalur 2a.

> Ketiganya berakar pada satu hal: `.install_method` kita isi `vbox-tarball`,
> sebuah nilai yang tidak dikenal Hermes. `is_unsupported_install_method()`
> hanya mengenal `pip` dan `homebrew`, jadi kita lolos semua penjagaan tanpa
> pernah ikut salah satu jalur yang didukung.

---

## 3. Opsi

Disusun dari yang paling murah. Bukan pilihan tunggal — A/B/C soal *kapan
user tahu*, D soal *kapan servernya siap*, E soal *seberapa besar unduhannya*.

### A. Poll di latar + tampilkan di luar Settings

Pindahkan `hermes_check_update` ke interval (mis. tiap 30 menit + saat app
fokus), simpan di state global, tampilkan titik kecil di navigasi.

- **Usaha**: kecil — mekanismenya sudah ada, tinggal dipanggil dari tempat
  yang benar.
- **Dampak**: menutup celah terbesar. Sekarang badge-nya ada tapi hampir tidak
  pernah dilihat siapa pun.
- **Catatan**: satu request manifest per interval per user, murah.

### B. Ajakan saat app dibuka

Pola `ForceUpdateGuard` (`ForceUpdateGuard.tsx`) sudah dipakai VBOX untuk
update dirinya sendiri: cek versi saat start, tampilkan modal. Bisa ditiru
untuk Hermes, tapi **jangan** dibuat memblokir seperti versi VBOX — install
Hermes bisa 5–15 menit dan orang membuka VBOX untuk bekerja.

- **Usaha**: kecil, komponennya tinggal dicontoh.
- **Dampak**: terlihat, tapi hanya sekali per sesi. Paling bagus digabung A.

### C. Terapkan otomatis di latar

VBOX mengunduh + extract + menjalankan stage sendiri tanpa diminta.

- **Usaha**: besar, dan ini yang paling banyak jebakannya. Hermes yang sedang
  jalan harus dihentikan dulu (source-nya sedang dipakai), sesi user putus di
  tengah kerja, `python-deps` bisa lama kalau dependency berubah, dan kalau
  gagal di tengah, Hermes tinggal setengah — `partial` di
  `hermes_check_installed()` sudah menyediakan konsepnya tapi belum ada
  pemulihan otomatis.
- **Saran**: kalau mau ke sini, mulai dari "unduh + extract otomatis, stage
  berat menunggu persetujuan". Unduhan 70 MB yang sudah siap membuat tombol
  Update terasa seketika, tanpa perlu berani mematikan Hermes diam-diam.

### D. Otomatiskan pack di server

GitHub Actions di `custom-hermes` → SSH ke server → `git pull && bun run
scripts/pack-hermes.ts`. Server sudah punya deploy key read-only
(`~/.ssh/deploy_custom-hermes`) dan sudah terbukti bisa mem-pack sendiri.

- **Usaha**: kecil — polanya sama persis dengan `deploy.yml` milik
  v-auto-backend.
- **Dampak**: menghapus langkah manusia. Tanpa ini, A/B/C hanya mempercepat
  kabar tentang pack terakhir yang kebetulan diingat seseorang.
- **Catatan**: `git archive` tidak byte-identik antar mesin, jadi sha256
  berubah walau commit sama. Aman — VBOX membandingkan hash ke manifest.

### E. Update inkremental

Kirim hanya file yang berubah, bukan tarball 70 MB penuh.

- **Usaha**: besar (perlu format manifest per-file + logika patch).
- **Dampak**: kecil selama update masih jarang. Belum layak sekarang.

### F. Push lewat relay, bukan poll

Hub sudah bisa mengirim ke node (`sendMcpRequest`), jadi secara teori server
bisa memberi tahu "ada versi baru" tanpa polling.

- **Masalahnya**: yang memegang koneksi relay adalah Hermes, bukan VBOX. Yang
  perlu diberi tahu justru VBOX, karena Hermes tidak bisa memperbarui dirinya
  sendiri dengan aman (source-nya sedang dieksekusi). Dan node hanya online
  kalau Hermes jalan — padahal yang paling perlu di-update adalah yang
  Hermes-nya sedang mati.
- **Kesimpulan**: tidak sepadan. Polling di A lebih sederhana dan lebih tepat
  sasaran.

---

## 4. Prasyarat (bukan opsi) — SUDAH DIKERJAKAN, lihat § 6

Bagian 2 sebaiknya ditutup sebelum jalur update mana pun dipercepat —
mempercepat jalur yang bocor hanya mempercepat kebocorannya.

1. **Blokir updater bawaan Hermes untuk install VBOX.** Tambahkan
   `vbox-tarball` ke daftar yang dikenal `hermes_cli/config.py`, lalu jadikan
   `cmd_update` berhenti dengan pesan "update lewat VBOX" — sekaligus
   menutup pintu 2a di Windows.
2. **Jangan sampai `POST /api/hermes/update` bisa jalan** di install
   `vbox-tarball` (`web_server.py:3757`) — saat ini hanya `docker` yang
   diblokir.
3. **Matikan pengecekan PyPI** kalau `install_method == "vbox-tarball"`
   (`banner.py:296`), supaya banner berhenti menawarkan update palsu.

Ketiganya kecil dan berada di `custom-hermes`, artinya butuh pack ulang untuk
sampai ke tim — jadi paling baik dikerjakan bersamaan dengan D.

---

## 5. Rekomendasi

**D + A dulu**, lalu prasyarat bagian 4, lalu B kalau masih terasa kurang
kelihatan. C ditunda sampai ada bukti orang benar-benar mengabaikan badge-nya.

Alasannya: D membuat "ada update" jadi pernyataan yang benar, A membuatnya
terlihat. Keduanya kecil dan tidak menyentuh alur install yang sudah bekerja.
C mempertaruhkan alur itu demi kenyamanan yang belum tentu dibutuhkan.

---

## 6. Yang dikerjakan — 10 Agustus 2026

Dipilih **D + A**.

### D — pack otomatis

`custom-hermes/.github/workflows/pack-vbox.yml`: push ke `main` → SSH ke
server → `deploy custom-hermes`. Bentuknya sengaja sama persis dengan
`deploy.yml` milik v-auto-backend (`deploy $REPO`, `REPO` = nama repo), jadi
tidak ada pola kedua yang perlu diingat.

Di server:

- `~/bin/deploy.sh` dapat fungsi `pack_hermes()` + case `custom-hermes`.
  Sesudah pack, manifest dibandingkan dengan `git rev-parse HEAD` dan gagal
  keras kalau tidak cocok — tanpa itu, pack yang error diam-diam akan
  menyisakan manifest lama di disk dan tetap terbaca "berhasil".
- Linter nginx dilewati untuk repo ini; pack tarball tidak menyentuh vhost.
- `~/bin/pack-entry.sh` — forced command **terpisah** dari `deploy-entry.sh`.
  Kunci CI custom-hermes hanya boleh `deploy custom-hermes`. Kalau ikut
  memakai allowlist deploy-entry.sh, bocornya secret di repo itu otomatis
  berarti bisa memicu deploy v-auto-backend/frontend juga. `deploy-entry.sh`
  sendiri tidak diubah sama sekali.

Kunci CI baru (ed25519, khusus repo ini) dipasang di `authorized_keys` dengan
forced command di atas; private key masuk ke GitHub Secrets custom-hermes
(`DEPLOY_KEY`/`DEPLOY_HOST`/`DEPLOY_USER`) tanpa pernah tercetak.

Terverifikasi: run `31350081071` sukses dalam 22 detik, manifest berpindah ke
`ea7344877`. Kunci CI ditolak saat mencoba `deploy v-auto-backend`.

Backend tidak perlu restart — `readManifest()` membaca `manifest.json` dari
disk tiap request.

### A — pengecekan berkala + penanda di luar Settings

`v-box/src/lib/hermes-update.ts` — store modul, bukan React Context. Alasannya
satu poller untuk berapa pun pemakai: dengan Context, tiap komponen baru yang
menampilkan status berarti satu `useEffect` lagi, dan dua saja sudah cukup
untuk melipatgandakan request manifest tanpa alasan.

- Poll tiap 30 menit + saat window dapat fokus, dengan jeda minimum 5 menit
  untuk yang dipicu fokus (tanpa itu, alt-tab bolak-balik = satu request per
  perpindahan).
- Snapshot hanya diganti kalau isinya berubah — `useSyncExternalStore`
  membandingkan identitas objek, jadi objek baru berisi sama akan me-render
  ulang tanpa ada yang berubah.
- Sidebar: titik kuning di ikon Settings (ikut terlihat saat sidebar menyempit
  jadi ikon saja) + label "update", tooltip menjelaskan.
- `Settings.tsx` berhenti memanggil `hermes_check_update` sendiri dan ikut
  store yang sama; sesudah install/update selesai ia memanggil
  `refreshHermesUpdate()` supaya penanda tidak menunggu poll berikutnya.

Tidak ada nag yang muncul untuk orang yang belum memasang Hermes —
`hermes_check_update` memang mengembalikan `available: false` kalau belum
terpasang, supaya Install dan Update tidak jadi dua ajakan yang bersaing.

**Batas verifikasi**: typecheck + build bersih, tapi badge-nya belum pernah
dilihat menyala di laptop yang benar-benar punya Hermes terpasang — laptop ini
tidak punya (`~/.hermes/hermes-agent/.vbox_commit` tidak ada). Perintah Rust
yang dipakainya sudah diverifikasi terpisah sebelumnya.

**Belum sampai ke tim**: v-box tidak punya pipeline deploy, jadi ini baru ada
setelah ada rilis VBOX berikutnya.

### Prasyarat § 4 — updater bawaan Hermes ditutup untuk install VBOX

Semuanya di `custom-hermes`. Pola-nya meniru penjagaan `docker` yang sudah ada,
supaya tidak lahir cara kedua untuk hal yang sama.

`hermes_cli/config.py` — satu tempat yang jadi rujukan sisanya:
`VBOX_INSTALL_METHOD`, `is_vbox_install()`, `format_vbox_update_message()`, dan
`recommended_update_command_for_method()` yang mengembalikan
"VBOX → Settings → Hermes Engine → Update" alih-alih `hermes update`.

Lalu empat pintu ditutup:

| Pintu | Sebelum | Sesudah |
|---|---|---|
| `hermes update` (`main.py`) | macOS/Linux buntu, **Windows menimpa fork dengan upstream** | berhenti dengan pesan VBOX, exit 1, **sebelum** menyentuh git/ZIP |
| `POST /api/hermes/update` | hanya memblokir `docker` | menolak, tidak men-spawn updater |
| `GET /api/hermes/update/check` | `can_apply` sudah `false` | tidak lagi memanggil `check_for_updates()` sama sekali |
| banner / badge TUI | menawarkan update palsu dari PyPI | diam |

Ditambah `/update` di TUI (`cli_commands_mixin.py`): dijaga lebih awal supaya
user tidak kehilangan sesinya hanya untuk diberi tahu "tidak bisa" —
`hermes update` toh sudah menolak, tapi handler itu keluar dari sesi dulu baru
menjalankannya.

`can_update_hermes` di payload status dashboard ikut `false`, jadi tombolnya
tidak muncul. Endpoint-nya tetap dijaga sendiri: yang menekan tombol bukan
satu-satunya yang bisa memanggilnya — relay VIMS mem-proxy path apa pun ke
server ini tanpa allowlist.

**Temuan yang tidak ada di rencana § 4** — dan tanpanya semua di atas jadi
kode mati: `scripts/install.sh` stage `complete` menulis
`echo "git" > $INSTALL_DIR/.install_method`. VBOX menulis stempel
`vbox-tarball` saat extract lalu **menjalankan stage itu**, jadi stempelnya
tertimpa pada setiap install dan update. Artinya di macOS/Linux tidak ada
satu pun penjagaan di atas yang pernah aktif di install VBOX yang sebenarnya.
Sekarang stempel yang sudah ada dihormati (`stamp_install_method_git()`);
install biasa tetap distempel `git` seperti dulu.

Ironisnya `install.ps1` tidak pernah menstempel sama sekali, jadi justru
Windows — satu-satunya platform dengan jalur ZIP yang berbahaya — yang selama
ini menyimpan stempel yang benar.

**Verifikasi** (bukan sekadar compile):

- `tests/test_vbox_install_update_guard.py`, 7 tes, lulus. Dicek bahwa tes
  `check_for_updates` benar-benar **gagal** kalau penjagaannya dilucuti —
  tanpa itu tesnya tidak membuktikan apa pun. Tes itu berjalan di subprocess:
  tes lain di suite ini menukar entri `sys.modules["hermes_cli.config"]`, jadi
  menambal objek modul dari file tes malah tidak menambal apa-apa dan hasilnya
  bergantung pada tes mana yang jalan duluan.
- 9 tes lain gagal saat suite dijalankan bersama (`test_managed_uv`,
  `test_update_autostash`, `test_web_server_cron_profiles`) — dipastikan
  **sudah gagal di tree bersih sebelum perubahan ini**, polusi antar-tes yang
  sudah ada.
- `POST /api/hermes/update` → `ok:false`, `error:"vbox_update_unsupported"`,
  `pid:null` (tidak ada proses updater yang lahir).
- `GET /api/hermes/update/check` → `can_apply:false`, `behind:null`.
- `hermes update --check` di tree ber-stamp `vbox-tarball` → exit 1, pesan
  VBOX, dan **tidak** ada lagi "Not a git repository".
