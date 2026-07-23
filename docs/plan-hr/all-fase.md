# Rencana Adopsi Modul HR ke v-auto (Internal Agency)

> Sumber: `hr-backend` + `hr-frontend` (aplikasi HRIS multi-tenant untuk UMKM).
> Target: `v-auto-backend` + `v-auto-frontend` (apps internal agency, **single-tenant**).
> Dibuat: 22 Jul 2026.

## Ringkasan & Keputusan Arsitektur

Stack kedua project **identik**: Bun + Hono + Drizzle + MySQL (backend), SvelteKit 5 + shadcn-svelte + Tailwind v4 (frontend). Porting = copy-adapt, bukan tulis ulang.

Keputusan yang dipegang saat porting:

1. **Buang multi-tenant.** HR app pakai `business_id` di tiap tabel + `requireBusinessContext` + header `X-Business-Id`. v-auto = satu perusahaan → **semua `business_id` dihapus**, filter tenant dihapus, middleware diganti `requireAuth`/gating role v-auto.
2. **Karyawan nyantol ke `users` yang sudah ada.** Tabel `employees` punya FK `user_id → users.id`. `users` + `profiles` tetap jadi identitas login. Tidak bikin sistem auth baru.
3. **Aktifkan role yang sudah ada.** `ROLE_HRD = 5` dan `ROLE_AKUNTAN = 6` sudah didefinisikan di `src/utils/auth/permissions.ts` tapi belum dipakai. HR-module = boleh diakses Dev/Admin/Owner + HRD; payroll/keuangan = + Akuntan.
4. **JANGAN auto-apply migrasi.** `.env` v-auto nunjuk **DB production**. Migrasi digenerate sebagai file SQL saja (`drizzle-kit generate`, tanpa koneksi DB); apply manual ke production dilakukan terpisah. (Migrasi `0033_add_video_requests` juga masih pending.)
5. **Bersihkan risiko yang tak ikut dibawa:** `BYPASS_PASSWORD` backdoor, `forgot-password` yang balikin token di response, sisa modul B2C/POS (`customers` e-commerce, Google OAuth customer). Ini **tidak** diport.
6. **Enum numeric.** HR simpan enum sebagai `tinyint` (single source of truth `src/constants/enums.ts`). Sejalan dengan konvensi role int v-auto. Enum HR yang dipakai diport ke v-auto.

Konvensi tabel v-auto yang diikuti: `id` autoincrement PK, `dataJson` untuk field fleksibel, `createdAt`/`updatedAt` (`defaultNow`/`onUpdateNow`), FK `.references(() => x.id, { onDelete: ... })`. Respons route selalu `{ success, data?, message? }`.

---

## Peta Fase

| Fase | Modul | Status |
|------|-------|--------|
| 1 | Master Organisasi + Karyawan (HRIS) | ✅ Selesai (23 Jul 2026) |
| 2 | Absensi & Jadwal Kerja (geofence) | ✅ Selesai (23 Jul 2026) |
| 3 | Izin & Cuti | ✅ Selesai (23 Jul 2026) |
| 4 | Approval Workflow (generik) | ✅ Selesai (23 Jul 2026) |
| 5 | Payroll & Kompensasi (PPh21/BPJS) | ✅ Selesai (23 Jul 2026) |
| 6 | Portal ESS (self-service karyawan) | ✅ Selesai (23 Jul 2026) |
| 7 | Pendukung (pengumuman, audit log, laporan) | ✅ Selesai (23 Jul 2026) |
| 8 | Compliance lanjutan (THR, pesangon, Coretax) | ✅ Selesai (23 Jul 2026) — Coretax = record-keeping (tanpa API DJP) |
| 9 | Field/Sales (klien, kunjungan, live GPS) — opsional | ✅ Selesai (23 Jul 2026) |

Legenda status: ⬜ Belum · 🟨 Sedang dikerjakan · ✅ Selesai · ⏭️ Ditunda

---

## Fase 1 — Master Organisasi + Karyawan (HRIS)

**Nilai:** fondasi semua modul HR. Semua fase lain butuh `employees`, `branches`, `departments`, `positions`.

### Backend
Tabel baru di `src/db/schema.ts` (tanpa `business_id`):
- `branches` — cabang; punya `latitude`, `longitude`, `radius` (untuk geofence absensi).
- `departments` — self-ref `parentId`, `headEmployeeId`.
- `positions` — `→ departments`.
- `employees` — inti; `userId → users.id`, `branchId`, `departmentId`, `positionId`, plus NIK, KTP, NPWP, BPJS, `employmentType`, `employmentStatus`, `taxStatusCode`, `defaultWorkScheduleId`.
- Child karyawan: `employeeFamilies`, `employeeDocuments`, `employeeEducations`, `employeeExperiences`, `employeeEmergencyContacts`, `employeeBankAccounts`.

Enum yang diport ke `src/constants/hrEnums.ts`: `EmploymentType`, `EmploymentStatus`, gender, jenis dokumen, dll (subset yang dipakai Fase 1).

Route baru (`src/routes/hr/`):
- `branches.ts` → `/branches`
- `departments.ts` → `/departments` (tree)
- `positions.ts` → `/positions`
- `employees.ts` → `/employees` (+ `POST /:id/resign`, `POST /:id/create-user-account`)
- `employeeRelations.ts` → mounted di `/employees` (families/documents/educations/experiences/emergency-contacts/bank-accounts)

Registrasi di `src/index.ts`, gating `requireManagement` + HRD.

### Frontend
- `/pengaturan/organisasi` — tab Cabang / Departemen / Posisi.
- `/karyawan` — DataTable + dialog tambah.
- `/karyawan/[id]` — detail 9 tab (Profil, Kepegawaian, Keluarga, Dokumen, Pendidikan, Pengalaman, Kontak Darurat, Gaji, Akun).
- API client `src/lib/api/hr/*`.
- Sidebar grup **HR**.

---

## Fase 2 — Absensi & Jadwal Kerja

### Backend
Tabel: `holidays`, `workSchedules` (jam kerja + toleransi telat), `employeeSchedules` (assign per tanggal), `attendances` (check-in/out + GPS + foto + `lateMinutes`/`overtimeMinutes`/`workMinutes`), `attendanceApprovals` (koreksi presensi).
Util: `src/utils/geo.ts` (Haversine geofence vs radius cabang).
Route: `attendances.ts` (`/attendances` + `today` + `:id/approve`), `workSchedules.ts`, `employeeSchedules.ts` (+ `bulk`), `holidays.ts` (+ `preview`, `bulk`, auto-fetch libur nasional).

### Frontend
- `/presensi/kehadiran` — tab Hari Ini / Ringkasan Bulanan / Riwayat + Export CSV.
- `/presensi/jadwal-kerja` — Jadwal Tetap / Shift / Flexible.
- `/presensi/approval` — approval koreksi absen.

---

## Fase 3 — Izin & Cuti

### Backend
Tabel: `leaveTypes` (`maxDaysPerYear`, `isPaid`, `requiresAttachment`, `gender`), `leaves`, `leaveBalances` (kuota/tahun).
Route: `leaves.ts` (`/leaves` + `:id/approve` + `:id/cancel`), sub-router `leave-types`, `leave-balances`.

### Frontend
- `/presensi/izin-cuti` — saldo cuti + pengajuan + approve/tolak.

---

## Fase 4 — Approval Workflow (generik)

Tabel: `approvalWorkflows`, `approvalWorkflowSteps` (`approverType`: manager/dept-head/role/user), `approvals` (polimorfik `module` + `referenceId` untuk attendance/leave/overtime/reimbursement/cashAdvance).
Route: `approvalWorkflows.ts`. Frontend: `/pengaturan/approval` (builder).
Ini "lem" yang menyatukan approval cuti/lembur/kasbon/reimburse Fase 3 & 5.

---

## Fase 5 — Payroll & Kompensasi

**Aktivasi role Akuntan (6).**

### Backend
Tabel: `salaryStructures`, `allowances`, `employeeAllowances`, `overtimes`, `cashAdvances` (+`cashAdvanceRepayments`), `reimbursements`, `payrollPeriods`, `payrolls`, `payrollComponents`, `payrollBpjsDetails`, + settings compliance (`payrollSettings`, `taxSettings`, `taxBrackets`, `ptkpSettings`, `bpjsSettings`, `roundingSettings`, `overtimeSettings`, `prorateSettings`).
Engine `src/services/payroll.ts`: generate per periode (idempotent), **PPh 21 progresif** (biaya jabatan 5%/max 500rb, PTKP, disetahunkan, non-NPWP +20%), **BPJS** (Kesehatan/JHT/JP/JKK/JKM dgn cap), lembur, potong cicilan kasbon, pembulatan.
Route: `payrolls.ts` (settings, periods generate/approve/mark-paid, slip), `compensation.ts`.

### Frontend
- `/penggajian` — daftar periode + Generate.
- `/penggajian/[id]` — detail periode (Generate/Approve/Tandai Dibayar).
- `/penggajian/[id]/[payrollId]` — slip gaji.
- `/pengaturan/penggajian` — komponen gaji.

---

## Fase 6 — Portal ESS (Self-Service Karyawan)

Route `/me` HR → diadopsi ke v-auto. Kandidat lokasi UI: **`v-auto-client`** (app mobile yang sudah ada) atau route group `/ess` di `v-auto-frontend`.
Endpoint `/me`: profil, absen check-in/out geofence+foto, cuti, jadwal, lembur, kasbon, reimburse, slip gaji, notifikasi, timeline, inbox approval atasan.
Fitur menonjol: **absen selfie + GPS geofence** (`SelfieCapture` + Haversine). Login karyawan bisa via WhatsApp link (sudah ada pola di v-auto).

---

## Fase 7 — Pendukung

- `announcements` + `announcementReads` — pengumuman (admin CRUD; di HR baru ada baca via `/me`).
- `activityLogs` — audit; ditulis via `utils/activity.ts`, perlu viewer.
- `reportTemplates` / `reportLogs` — laporan.

---

## Fase 8 — Compliance Lanjutan (schema-only di HR)

- THR: `thrSettings`, `thrDisbursements`.
- Pesangon: `severanceSettings`, `severancePayments`.
- Pajak/Coretax DJP: `employeeTaxProfiles`, `taxWithholdingSlips` (bukti potong 1721-A1), `coretaxSubmissions`.
- `companyBankAccounts`, `pettyCash` (+transactions).

Semua ini di HR **belum ada route** (skema doang) → butuh dibangun, bukan sekadar port.

---

## Fase 9 — Field/Sales (opsional, ada overlap)

- `clients`, `clientVisits` (kunjungan + GPS + foto), `locationTracks` (live GPS + deteksi mock-location).
- Catatan: v-auto sudah punya modul `customers`; pertimbangkan overlap sebelum adopsi.

---

## Catatan Eksekusi

- Route HR ditaruh di subfolder `src/routes/hr/` supaya rapi & mudah dilepas.
- **Kontrak null→undefined:** frontend HR mengirim field opsional kosong sebagai `null`, sedangkan zod `.optional()` hanya menerima `undefined`. Semua `zValidator("json", X)` di route HR dibungkus `jsonBody(X)` (`src/utils/zod.ts`, preprocess null→undefined). **Port fase berikutnya WAJIB ikut pola ini** untuk tiap body validator.
- Setiap fase: schema → generate migrasi (file saja) → routes → register `index.ts` → `bun` typecheck → frontend → build.
- Status tiap fase diupdate di tabel "Peta Fase" di atas setelah selesai.

---

## Log Progress

### 23 Jul 2026 — Fase 1–3 SELESAI (backend + frontend, build hijau)

**Backend `v-auto-backend`:**
- `src/db/schema.ts`: +18 tabel HR (branches, departments, positions, employees + 6 child, holidays, work_schedules, employee_schedules, attendances, attendance_approvals, leave_types, leaves, leave_balances). Tanpa `business_id`. Import `time` ditambah.
- `src/constants/hrEnums.ts`: enum HR (backend).
- `src/middleware/hrAccess.ts`: `requireHR` (management + HRD) & `requireFinance` (management + Akuntan) + `getHrUserId`.
- `src/utils/geo.ts`: haversine geofence.
- `src/routes/hr/`: 10 file route diport (branches, departments, positions, employees, employeeRelations, workSchedules, employeeSchedules, holidays, attendances, leaves) — tenant/business dibuang, `create-user-account` set `users.role` langsung (tanpa business_users).
- `src/index.ts`: 10 route HR didaftarkan (`/branches`, `/departments`, `/positions`, `/employees` ×2, `/work-schedules`, `/employee-schedules`, `/holidays`, `/attendances`, `/leaves`).
- `src/routes/uploads.ts`: +`POST /api/uploads` (requireAuth, multipart) untuk upload dokumen/foto karyawan.
- `drizzle/0034_add_hr_phase1.sql`: migrasi hand-written (journal drizzle beku di 0016, sama seperti 0017–0033). **BELUM di-apply ke DB production** — apply manual.
- Verifikasi: `bun build src/index.ts` → 774 modul, resolusi bersih. (tsc penuh error di file lama karena drift versi tsc; file HR baru 0 error.)

**Frontend `v-auto-frontend`:**
- `src/lib/constants/enums.ts`: mirror enum HR (+Label maps) — verbatim.
- `src/lib/api/`: 10 file (branches, departments, positions, employees, workSchedules, employeeSchedules, holidays, attendances, leaves, uploads) — pakai `./client` v-auto, `businessId` dibuang dari interface.
- `src/lib/components/hr/`: ComboboxField, DatePicker, DateRangePicker, MonthPicker, ViewToggle, EmployeeForm, EmployeePicker + `employee/` (Account/Documents/Educations/EmergencyContacts/Experiences/Families Tab). **CompensationTab TIDAK diport** (butuh payroll Fase 5).
- `src/lib/components/ui/data-table/status-badge-cell.svelte` (+peek-icon) ditambah + di-export di barrel `index.ts`.
- Halaman: `/pengaturan/organisasi`, `/karyawan` + `/karyawan/[id]` (8 tab, tab **Gaji** dihapus → nunggu Fase 5), `/presensi/kehadiran`, `/presensi/jadwal-kerja`, `/presensi/approval`, `/presensi/izin-cuti`.
- `src/lib/components/app-sidebar.svelte`: grup **HR** ditambah + gating role **HRD (5)** → lihat grup HR + System.
- Verifikasi: `vite build` (adapter-static) → **sukses, 0 error**.

**Yang WAJIB dilakukan manual sebelum fitur hidup di production:**
1. **Apply migrasi** `drizzle/0034_add_hr_phase1.sql` ke DB production (18 tabel). Migrasi `0033_add_video_requests` juga masih pending — cek dulu.
2. Set `PUBLIC_API_BASE_URL` frontend sudah benar (dipakai halaman HR lewat `$lib/api/client`).
3. Pastikan `UPLOAD_DIR` backend writable (dipakai `POST /api/uploads`).

**Catatan / utang teknis kecil (bukan blocker):**
- Tab **Gaji** (CompensationTab) di detail karyawan sengaja dihapus; balik lagi saat Fase 5.
- `inline-text-cell-read-only.svelte` v-auto lebih sederhana dari versi HR → quick-action hover (copy/peek) di sel tabel HR tak muncul. Kosmetik.
- Beberapa link di halaman kehadiran mengarah ke `/karyawan/:id` (sudah ada) — aman.
- Data awal belum ada: perlu seed minimal (min. 1 branch untuk geofence, leave_types, work_schedule default) via UI setelah migrasi.

### 23 Jul 2026 — Fase 4 SELESAI (Approval Workflow generik)

**Backend:** +3 tabel di `schema.ts` (`approval_workflows`, `approval_workflow_steps`, `approvals` — polimorfik `module`+`reference_id`). Migrasi `drizzle/0035_add_hr_phase4.sql` (**belum di-apply**). Route `src/routes/hr/approvalWorkflows.ts` (port, tenant dibuang, `requireHR`, `jsonBody`), didaftarkan `/api/approval-workflows` di `index.ts`. Bundle bersih.

**Frontend:** `src/lib/api/approval-workflows.ts` + halaman `src/routes/pengaturan/approval/` (5 file: page, form-dialog, flow-preview, columns, helper) + 2 file konstanta baru `src/lib/constants/{approvals,roles}.ts` (label module & approver-type). Sidebar HR + "Approval Workflow". Approver picker pakai `$lib/api/users` (bukan employees). `vite build` hijau.

**Catatan / utang teknis:** ini baru **builder** workflow-nya. **Engine penegakan approval** (bikin baris `approvals` saat pengajuan, blokir sampai semua step approve, resolusi approver by manager/dept-head/role/user) belum diwire — itu bagian portal ESS `/me` (Fase 6). Selain itu opsi role di approver-type "Role" (`roles.ts`) masih pakai penamaan role HR (Owner/Admin/CS/Finance), belum diselaraskan ke role v-auto (Dev/Admin/Owner/HRD/Akuntan/Head) — kosmetik, rapikan saat engine dibangun.
- **Apply manual:** `drizzle/0035_add_hr_phase4.sql` (3 tabel).

### 23 Jul 2026 — Fase 5 SELESAI (Payroll & Kompensasi)

**Role Akuntan (6) diaktifkan.** Gate baru `requirePayroll` (management + HRD + Akuntan) di `hrAccess.ts`.

**Backend:** +20 tabel di `schema.ts` (payroll_periods, payrolls, payroll_components, payroll_bpjs_details, salary_structures, allowances, employee_allowances, overtimes, cash_advances, cash_advance_repayments, reimbursements, payroll_settings, payslip_settings, overtime_settings, prorate_settings, tax_settings, tax_brackets, ptkp_settings, bpjs_settings, rounding_settings). Migrasi `drizzle/0036_add_hr_phase5.sql` (**belum di-apply**). Engine `src/services/payroll.ts` → `generatePeriod(periodId)`: PPh21 progresif (biaya jabatan, PTKP, disetahunkan, non-NPWP +20%), BPJS Kesehatan/JHT/JP/JKK/JKM + cap, lembur, potong kasbon, pembulatan. Route `src/routes/hr/payrolls.ts` (mount `/payrolls`) + `compensation.ts` (mount root: `/salary-structures`, `/allowances`, `/employee-allowances`). `requirePayroll` + `jsonBody`. Bundle bersih.

**Frontend:** `src/lib/api/payroll.ts` (semua interface + Label + `MONTHS_ID`). Halaman `/penggajian`, `/penggajian/[id]` (Generate/Approve/Tandai Dibayar), `/penggajian/[id]/[payrollId]` (slip), `/pengaturan/penggajian` (komponen gaji). `CompensationTab` (Gaji) diport & **tab Gaji dikembalikan** di detail karyawan. Sidebar grup **Penggajian** (management + HRD + Akuntan). `vite build` hijau.

**Adaptasi & utang teknis:**
- Engine ambil `ptkpCode`/`isNpwp` dari kolom `employees.taxStatusCode` + `employees.npwp` (tabel `employeeTaxProfiles` per-tahun BELUM diport — Fase 8). Rumus pajak sama, sumber datanya disederhanakan.
- Tabel settings jadi **singleton** (businessId dibuang → tak ada unique key): handler `settings.put`/`seed-defaults` diubah jadi "update baris pertama kalau ada, else insert" (bukan `onDuplicateKeyUpdate` yang tak pernah nabrak).
- Enum payroll (BpjsType, PayrollStatus, dll) di-inline lokal di engine/route (nilai sama dgn hr enums) — belum dipusatkan ke `hrEnums.ts`. Kosmetik.
- **Seed defaults PPh21/BPJS/PTKP** (`POST /api/payrolls/settings/seed-defaults`) pakai angka UU HPP 2022 — WAJIB diverifikasi ke regulasi terbaru sebelum dipakai produksi.
- **Apply manual:** `drizzle/0036_add_hr_phase5.sql` (20 tabel).

**Alur pakai:** seed-defaults settings → set struktur gaji & tunjangan karyawan (tab Gaji / /pengaturan/penggajian) → buat periode → Generate → review slip → Approve → Tandai Dibayar.

### 23 Jul 2026 — Fase 6 SELESAI (Portal ESS self-service)

**Backend:** +4 tabel (announcements, announcement_reads, activity_logs, notifications — migrasi `drizzle/0037_add_hr_phase6.sql`, **belum di-apply**). `src/utils/activity.ts` (logActivity + notify). `src/middleware/employee.ts` (`requireEmployeeContext`/`getEmployee`/`isApprover` — resolve employee by `userId`, single-tenant). `src/routes/hr/me.ts` didaftarkan di `/api/me`: profil, absen check-in/out (geofence+foto), cuti/lembur/kasbon/reimburse (+ inbox approval atasan approve/reject), jadwal, slip gaji, notifikasi, timeline. Enum HR ditambah ke `hrEnums.ts`. Bundle bersih.

**Frontend:** route group `src/routes/ess/*` (13 halaman mobile + layout bottom-nav), komponen `src/lib/components/ess/*` (SelfieCapture/BottomNav/StatusBadge), `src/lib/ess/*` (store, format), `src/lib/api/ess.ts`. Ditambah `clearAdminAuth()` ke `client.ts`. `vite build` hijau.

**Cara akses:** karyawan (user yang punya baris employees ter-link) login lewat /login/admin lalu buka **/ess** (mobile). Tidak ada di sidebar admin (memang portal terpisah).

**Catatan:**
- `GET /me/company` baca profil perusahaan dari tabel `settings` key `company_profile` (v-auto tak punya tabel `businesses`). Isi 1 row settings itu bila mau tampil.
- Approver (inbox `/me/approvals`) sekarang wajib juga punya baris `employees` ter-link (karena `requireEmployeeContext` di parent). Karena `sync-from-users` bikin employee untuk semua user, admin/atasan otomatis kebawa.
- **Apply manual:** `drizzle/0037_add_hr_phase6.sql` (4 tabel).

### 23 Jul 2026 — Fase 7, 8, 9 (semua build hijau)

**Fase 7 (Pendukung) — SELESAI (reports ditunda):**
- Tabel announcements/announcement_reads/activity_logs sudah masuk di migrasi 0037; report_templates/report_logs masuk migrasi 0039.
- Backend: `src/routes/hr/announcements.ts` (CRUD, `/api/announcements`), `src/routes/hr/activityLogs.ts` (read-only viewer, `/api/activity-logs`, gate `requireHR`).
- Frontend: `/pengumuman` (CRUD pengumuman → tampil di ESS `/me/announcements`), `/audit-log` (viewer). Sidebar HR.
- **Ditunda:** modul Laporan (report_templates/report_logs) — tabel siap, engine/UI belum dibangun (tak ada sumber; butuh desain sendiri).

**Fase 9 (Field/Sales) — SELESAI:**
- Migrasi `drizzle/0038_add_hr_phase9.sql` (clients, client_visits, location_tracks).
- Backend: `src/routes/hr/{clients,clientVisits,locationTracks}.ts` → `/api/clients`, `/api/client-visits`, `/api/location-tracks`.
- Frontend: `/klien`, `/presensi/kunjungan-klien` (check-in/out GPS+foto), `/pelacakan-lokasi` (live GPS + embed OpenStreetMap). `ClientPicker` diport. Sidebar HR.

**Fase 7 — Laporan DILENGKAPI:** `src/routes/hr/reports.ts` (`/api/reports` — templates CRUD + `/generate` ringkasan kehadiran/payroll/cuti/keuangan + `/logs`) + halaman `/laporan` (pilih modul + rentang tanggal → tabel + Export CSV + riwayat).

**Fase 8 (Compliance) — SELESAI PENUH (23 Jul 2026, lanjutan):**
Semua modul fondasi kini punya route + halaman + masuk sidebar:
- **THR** — `src/routes/hr/thr.ts` (`/api/thr`: settings, generate per tahun+hari raya, mark-paid) + halaman `/thr`. Rumus Permenaker 6/2016 (≥12 bln = 1× upah; <12 bln proporsional).
- **Pesangon** — `src/routes/hr/severance.ts` (`/api/severance`: settings, `/compute` preview, simpan, mark-paid) + halaman `/pesangon`. Rumus UP + UPMK per PP 35/2021 (by masa kerja); multiplier alasan PHK dari settings (default 1).
- **Profil Pajak** — `src/routes/hr/employeeTaxProfiles.ts` (`/api/employee-tax-profiles` CRUD per employee+tahun) + halaman `/pengaturan/pajak-karyawan`. **Di-wire ke engine payroll**: `computeMonthlyTax` utamakan `employee_tax_profiles` (ptkpCode + isNpwpHolder) per tahun, fallback ke kolom `employees`.
- **Bukti Potong** — `src/routes/hr/taxSlips.ts` (`/api/tax-slips`: `/generate` dari payrollPeriod → 1721-A1 per karyawan, gross/PPh21 dari payroll) + halaman `/bukti-potong`.
- **Coretax** — `src/routes/hr/coretax.ts` (`/api/coretax`: CRUD + submit/accept/reject) + halaman `/coretax`. **Record-keeping saja — TIDAK ada integrasi API DJP Coretax** (perlu kredensial/endpoint DJP resmi).
- Semua gate `requireFinance`, `jsonBody`, build hijau.

**Peringatan produksi:** rumus THR/pesangon/PPh21 dan angka seed pakai regulasi umum (Permenaker 6/2016, PP 35/2021, UU HPP) — **wajib diverifikasi ke regulasi terbaru + kasus spesifik perusahaan** sebelum dipakai bayar beneran. Coretax butuh integrasi API DJP tersendiri.

**(catatan lama) Fase 8 tahap awal:**
- Migrasi `drizzle/0039_add_hr_phase8.sql`: **13 tabel** (company_bank_accounts, petty_cash+transactions, thr_settings+disbursements, leave_allowance_settings, severance_settings+payments, employee_tax_profiles, tax_withholding_slips, coretax_submissions, report_templates, report_logs). **Data model HR sekarang LENGKAP.**
- Yang **jalan penuh** (non-regulatory): `src/routes/hr/companyBankAccounts.ts` + `pettyCash.ts` → `/api/company-bank-accounts`, `/api/petty-cash` (+transactions, auto-update saldo). Frontend `/keuangan` (2 tab: Rekening Perusahaan + Petty Cash). Gate `requireFinance`. Sidebar grup Penggajian.
- **Fondasi (schema saja, belum ada route/UI):** THR (thr_settings/disbursements), Pesangon (severance_settings/payments), Profil Pajak per-tahun (employee_tax_profiles), Bukti Potong (tax_withholding_slips), Coretax DJP (coretax_submissions), leave_allowance_settings. Ini **greenfield murni** di HR (schema-only, tanpa implementasi apa pun) — butuh logika regulasi Indonesia (rumus THR, pesangon UU Cipta Kerja, integrasi API Coretax DJP) yang tak bisa di-port; kerjakan sebagai fitur tersendiri dengan spesifikasi domain.

**Migrasi baru yang WAJIB di-apply manual:** `0037` (Fase 6), `0038` (Fase 9), `0039` (Fase 8). Total pending: 0033–0039.

### Status akhir: 8 dari 9 fase selesai penuh; Fase 8 = data model lengkap + 2 fitur keuangan jalan, sisanya (THR/pesangon/Coretax/laporan) fondasi menunggu implementasi domain.

### Rekomendasi lanjut
Fase berikutnya paling worth: **Fase 5 (Payroll)** untuk mengaktifkan role Akuntan + tab Gaji, atau **Fase 6 (Portal ESS)** supaya karyawan bisa absen selfie-GPS sendiri. Keduanya sudah "jalan penuh" di hr-backend jadi tinggal port pola yang sama.
