
## Role & Akses (Model Final)

Hanya **7 role** ini yang berlaku. ID disimpan di `users.role` dan sinkron dengan
`ROLE_OPTIONS` di frontend (`v-auto-frontend/src/routes/users/admin/columns.ts`)
serta konstanta di `src/utils/auth/permissions.ts`.

| ID | Role | Keterangan |
|----|------|------------|
| 0 | **Dev** | Developer (super admin) |
| 1 | **Admin** | Administrator |
| 2 | **Owner** | Business owner |
| 3 | **CSS** | Customer Support Specialist |
| 4 | **Advertiser** | Ad manager |
| 5 | **HRD** | Human Resources |
| 6 | **Akuntan** | Accountant |
| 7 | **Head Advertiser** | Kepala divisi iklan (management level) |

### Aturan akses

Tidak ada sistem permission string yang detail (sudah dihapus). Aturannya sederhana:

1. **Semua user yang login bisa melakukan apa saja** — mis. CRUD customer, dll.
2. **Hanya Dev (0), Admin (1), Owner (2), Head Advertiser (7)** yang boleh mengakses area manajemen:
   - **Users**: list + CRUD (`/users`)
   - **Chrome Histories**: list + delete (`/chrome-histories`)
   - **Team Insights**: `/team-insights`

Gate ini diterapkan lewat middleware `requireManagement` (baca role dari JWT) dan
helper `isManagementLevel(role)` di `src/utils/auth/permissions.ts`.

> Catatan: `/chrome-histories/track` tetap terbuka (tanpa auth) karena dipanggil
> oleh chrome extension.

### Data scope iklan (terpisah)

Untuk monitoring iklan (`advertiserScope` / `adsMonitoring`), hanya **Dev, Admin,
Owner & Head Advertiser** (`isManagementLevel`) yang melihat seluruh data; role lain
di-scope ke subscription miliknya sendiri (`subscriptions.advertiserId == userId`).
Ini soal *visibilitas data*, bukan gate aksi.
