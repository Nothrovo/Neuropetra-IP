# Neuropetra IP
## Dokumentasi Teknis
### Threat Intelligence, Telemetry Correlation & IoC Reporting Engine untuk SOC Lab

| INTERNAL — SOC Lab   |   Do not share outside authorised named recipients |
| :--- |

---

## DOCUMENT CONTROL

| Field | Value | Field | Value |
| :--- | :--- | :--- | :--- |
| **Document name** | Neuropetra IP Technical Documentation | **Classification** | Internal |
| **Document ID** | SOC-DOC-NEUROPETRA-001 | **Personal data?** | No |
| **Version** | 1.0 | **Owner (Data Owner)** | SOC Lab |
| **Status** | Active | | |
| **Created by / date** | Hadi Nurhasan Darma / 2026-11-13 | **Reviewed by / date** | |
| **Next review date** | Yearly | **Retention** | Until superseded; secure erase |

---

## VERSION HISTORY

| Version | Date | Author | Reviewed by | Summary of change |
| :--- | :--- | :--- | :--- | :--- |
| 1.0 | 2026-11-13 | Hadi Nurhasan Darma | - | Initial production technical documentation |

---

Dokumen ini menjelaskan cara kerja teknis Neuropetra IP secara end-to-end: arsitektur, komponen inti, pembagian hak akses database PostgreSQL, protokol korelasi telemetri lokal dan reputasi eksternal, format pelaporan IoC standar Charlie Reporter (n8n), microservice sidecar, serta mitigasi keamanan operasional.

---

## Daftar Isi
- Gambaran Umum
- Arsitektur & Layout File
- Konfigurasi & Environment
- Arsitektur Database & Kontrak Hak Akses (PostgreSQL 16)
- Telemetri Lokal vs. Reputasi Eksternal (Zero Tampering)
- Workflow Investigasi & Threat Ranking Engine
- Integrasi Teknis dengan Charlie Reporter (n8n)
- Format Standar Pelaporan IoC (ASOC Specification)
- Microservice Neuropetra Sidecar (:8899)
- Otomatisasi Blocklist Feeds (Wazuh CDB)
- Scoped Database Maintenance & Retensi Data
- Deployment, Jaringan & Troubleshooting

---

## 1. Gambaran Umum

### Masalah yang Diselesaikan
Dalam operasional SOC, analis keamanan kerap mengalami hambatan saat melakukan triage alamat IP mencurigakan: intelijen ancaman eksternal sering kali mencampurkan opini provider luar dengan bukti log lokal, sementara data observasi Wazuh SIEM tercecer dan tidak terhubung secara instan. Selain itu, pemanggilan API reputasi publik (seperti AbuseIPDB atau VirusTotal) memiliki kuota terbatas dan rentan membocorkan topologi IP privat lokal jika dilakukan tanpa filter.

Neuropetra IP memecahkan masalah ini dengan menjadi sistem investigasi dan korelasi IP tersentralisasi: menyimpan data telemetri historis (first seen, last seen, jumlah alert, taktik MITRE, payload) secara independen, menyediakan pencarian lokal instan (sub-milidetik), mengelola cache reputasi eksternal secara hemat kuota, serta menerbitkan format laporan IoC standar yang langsung selaras dengan generator laporan Charlie Reporter (n8n).

### Posisi dalam Ekosistem
```text
Diptera (browser, port 8787)
    │
    │  POST alert JSON
    ▼
Charlie Reporter (n8n, port 5678)
    │
    │  GET /ip-intel?ips=...   ← cek cache reputasi lokal
    │  POST /ip-intel          ← simpan hasil deteksi & taktik
    ▼
Neuropetra Sidecar (port 8899)
    │
    │  (connection pool)
    ▼
PostgreSQL 16 (ip_intel_cache, ip_intel_events, ip_intel_reputation)
    ▲
    │  (scoped read/write)
Neuropetra IP (Next.js 16 Web UI & API, port 3000)
    │
    │  GET /api/blocklist?format=cdb  (machine token)
    ▼
Wazuh Active Response / Perimeter Firewall (Edge IP Blocking)
```

> **Penting:** Neuropetra menerapkan pemisahan ketat antara observasi lokal dan reputasi eksternal. Enrichment AbuseIPDB tidak pernah memanipulasi timestamp observasi lokal (first_seen/last_seen) atau menambah jumlah hitungan alert. Integritas bukti forensik dipertahankan 100%.

---

## 2. Arsitektur & Layout File

### Komponen Utama
```text
ip-intel/
├── app/                          ← Next.js 16 App Router (UI & API routes)
│   ├── api/                      ← Backend API endpoints
│   │   ├── admin/                ← Rute terproteksi role admin (settings, maintenance)
│   │   ├── auth/                 ← Login, logout, session, reauth, bootstrap setup
│   │   ├── blocklist/            ← Feed generator (TXT, CSV, Wazuh CDB)
│   │   ├── bulk/                 ← Local lookup telemetri massal (cache-first)
│   │   ├── enrich/               ← External lookup AbuseIPDB dengan zero-egress filter
│   │   └── ip/[ip]/              ← Detail intelijen & timeline forensik per IP
│   ├── investigate/              ← Unified Investigation Workbench UI
│   ├── dashboard/                ← Macro Threat Analytics Dashboard
│   ├── providers/                ← ISP, ASN, dan Provider intelligence breakdown
│   ├── settings/                 ← Panel manajemen kunci AbuseIPDB & database
│   └── setup/                    ← Form inisialisasi administrator pertama
├── components/                   ← Komponen React modular (workbench, visualizer, tables)
│   ├── investigation/            ← InvestigationResults, IndicatorInput, state manager
│   ├── DefangButton.tsx          ← Tombol salin IP mentah dan defanged IP
│   └── ScoreGauge.tsx            ← Visualisasi speedometer skor komposit ancaman
├── lib/                          ← Core business logic, repositories & utilities
│   ├── clipboard.ts              ← Universal clipboard fallback utility (LAN-safe)
│   ├── charlie-ioc-formatter.ts  ← Standar tabel IoC format ASOC untuk Charlie Reporter
│   ├── db.ts & db-pool.ts        ← Scoped connection pool PostgreSQL
│   ├── scoring.ts                ← Algoritma kalkulasi severity & composite score
│   └── ip-validator.ts           ← Validator format IP, CIDR & klasifikasi IP publik/privat
├── migrations/                   ← DDL migrations terurut (001_initial.sql s/d 005)
├── scripts/                      ← Script operator bootstrap, provisioning, dan CI checks
├── docker-compose.yml            ← Definisi container aplikasi Next.js
├── compose.postgres.yml          ← Overlay database PostgreSQL 16 & migration runner
└── compose.operator.yml          ← Overlay bootstrap operator token
```

### Peran Tiap File & Modul Inti
- `lib/clipboard.ts` — Utility penyalinan clipboard universal. Menggunakan modern `navigator.clipboard` di secure context (HTTPS/localhost), dan beralih otomatis ke DOM textarea fallback (`execCommand`) saat diakses melalui HTTP LAN (`10.20.100.117`). Mencegah crash tombol copy di browser analis.
- `lib/charlie-ioc-formatter.ts` — Generator tabel IoC standar ASOC (5 kolom) untuk integrasi dengan Charlie Reporter. Menyediakan fungsi normalisasi nama negara (`getFullCountryName`) dan klasifikasi skor ancaman (`classifyThreatScore`).
- `app/api/enrich/route.ts` — Endpoint enrichment AbuseIPDB massal. Dilengkapi proteksi zero-egress: secara otomatis mencegat alamat non-global/privat dan menandainya sebagai `local_private` tanpa membocorkan request keluar.
- `app/api/blocklist/route.ts` — Endpoint ekspor indikator ancaman dalam format teks murni (TXT), CSV (dengan proteksi formula injection), dan format CDB biner/teks khusus agen Wazuh.
- `lib/db.ts` & `lib/db-pool.ts` — Pengelola koneksi PostgreSQL terisolasi. Memisahkan login auth, read telemetri, penulisan reputasi, dan operasi maintenance ke dalam connection pool independen.

---

## 3. Konfigurasi & Environment

### Alur Injeksi Konfigurasi
```text
Environment Vars (.env / secrets / compose.env)
    │
    ▼ lib/config.ts — fungsi loadConfig()
    │  Membaca nilai langsung atau membaca dari file proteksi (*_FILE)
    │  Memvalidasi integritas APP_ORIGIN dan URL koneksi database
    ▼ Runtime Next.js / Server Actions / API Routes
```

### Variabel Environment
| Var | Default | Keterangan |
| :--- | :--- | :--- |
| `APP_ORIGIN` | `http://127.0.0.1:3000` | Origin kanonikal browser. HTTP diizinkan untuk loopback dan private LAN (RFC 1918/4193); domain publik WAJIB HTTPS. |
| `AUTH_DATABASE_URL` | *(wajib)* | Koneksi database khusus manajemen user, sesi scrypt, dan throttling. |
| `READ_DATABASE_URL` | *(wajib)* | Koneksi read-only murni untuk query telemetri cache, events, dan reputasi. |
| `REPUTATION_DATABASE_URL` | *(wajib)* | Koneksi writer khusus ke tabel reputasi `ip_intel_reputation`. |
| `MAINTENANCE_DATABASE_URL` | *(opsional)* | Koneksi berhak khusus untuk eksekusi job invalidasi retensi reputasi. |
| `ENABLE_EXTERNAL_ENRICHMENT` | `false` | Master toggle fitur enrichment AbuseIPDB. Wajib diset `true` untuk mengaktifkan pemanggilan live API. |
| `ABUSEIPDB_API_KEY` | *(opsional)* | API key AbuseIPDB server-side (dapat juga dikelola langsung via Web UI). |
| `USE_MOCK_DATA` | `false` | Menyediakan telemetri sintetis untuk testing/CI tanpa memotong autentikasi PostgreSQL. |
| `APP_PORT` | `3000` | Port listening container/host. |
| `APP_BIND_IP` | `0.0.0.0` | Binding interface jaringan (gunakan `127.0.0.1` bila di balik reverse proxy lokal). |

> **Penting:** Jangan gunakan `DATABASE_URL` umum. Neuropetra menolak koneksi monolitik dan mewajibkan koneksi terpisah (AUTH, READ, REPUTATION, MAINTENANCE) guna menegakkan prinsip Least Privilege.

---

## 4. Arsitektur Database & Kontrak Hak Akses (PostgreSQL 16)

### Matriks 5 Peran Database
| Identitas Login | Grup Runtime | Hak Akses & Lingkup Operasi |
| :--- | :--- | :--- |
| `ip_intel_migration_login` | *(None)* | Pemilik objek/skema; menjalankan file migrasi DDL `NNN_name.sql`. Dilarang dimount ke web app. |
| `ip_intel_auth_login` | `ip_intel_auth` | SELECT/INSERT/UPDATE/DELETE pada user, sesi, dan auth attempts. SELECT feed tokens. |
| `ip_intel_read_login` | `ip_intel_read` | SELECT murni pada cache telemetri, events, reputasi, dan audit. Tidak ada izin write. |
| `ip_intel_reputation_login` | `ip_intel_reputation` | SELECT/INSERT/UPDATE pada tabel reputasi dan USAGE sequence. Dilarang modifikasi telemetri. |
| `ip_intel_maintenance_login` | `ip_intel_maintenance` | Khusus eksekusi rencana retensi reputasi, update status plan, dan penulisan audit. |

### Skema Data Telemetri Lokal
```sql
-- ip_intel_cache: Rekapitulasi per IP
CREATE TABLE ip_intel_cache (
    ip                    text PRIMARY KEY,
    first_seen            timestamptz NOT NULL, -- Wajib diisi proses ingest
    last_seen             timestamptz NOT NULL,
    total_alert_count     integer NOT NULL DEFAULT 0,
    attack_types          text[] NOT NULL DEFAULT '{}',
    mitre_tactics         text[] NOT NULL DEFAULT '{}',
    target_hosts          text[] NOT NULL DEFAULT '{}',
    endpoints_targeted    text[] NOT NULL DEFAULT '{}',
    http_methods_used     text[] NOT NULL DEFAULT '{}',
    abuse_score           integer,
    vt_malicious          integer,
    country_code          text,
    isp                   text,
    geo_json              jsonb,
    reputation_json       jsonb,
    reputation_checked_at timestamptz
);

-- ip_intel_events: Bukti peristiwa spesifik (forensik)
CREATE TABLE ip_intel_events (
    id             bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    ip             text NOT NULL REFERENCES ip_intel_cache(ip) ON DELETE RESTRICT,
    seen_at        timestamptz NOT NULL,
    alert_type     text,
    attack_subtype text,
    target_host    text,
    endpoint       text,
    outcome        text,
    raw_summary    text,
    mitre          text[] NOT NULL DEFAULT '{}'
);
```

### Sequence Monotonik & Proteksi ABA
Tabel reputasi mandiri (`ip_intel_reputation`) dilengkapi kolom `revision bigint NOT NULL DEFAULT 1` yang dikendalikan oleh trigger sequence `ip_intel_reputation_revision_seq`. Setiap mutasi menambah nomor revisi, sehingga job maintenance/retensi dapat mengunci snapshot data secara konsisten dan menolak eksekusi bila terjadi perubahan data di tengah-tengah proses (pencegahan ABA Problem).

---

## 5. Telemetri Lokal vs. Reputasi Eksternal (Zero Tampering)

### Integritas Forensik Bukti Log
Di banyak platform intelijen, ketika analis melakukan pencarian IP eksternal, sistem secara otomatis membuat record tiruan seolah-olah IP tersebut telah menyerang jaringan. Neuropetra menolak pendekatan cacat ini.

Tabel `ip_intel_cache` (observasi lokal) dan `ip_intel_reputation` (intelijen eksternal) dipisahkan total. Reputasi pihak ketiga tidak pernah memanipulasi timestamp observasi lokal (`first_seen`/`last_seen`) atau menambah hitungan `total_alert_count`. Jika suatu IP hanya di-enrich dari AbuseIPDB tanpa ada log lokal, IP tersebut hanya tersimpan di tabel reputasi.

### Normalisasi Skor Reputasi
Indikator reputasi mandiri yang belum pernah terlihat dalam telemetri lokal secara dinamis dinormalisasi skor kompositnya tanpa penalti unobserved telemetry. Skor ancaman dihitung dari data AbuseIPDB, sedangkan status lokal tetap diberi label "Local miss" atau "Reputation only".

---

## 6. Workflow Investigasi & Threat Ranking Engine

### Mode Pencarian (Search Local vs Enrich All)
- `Search Local` — Menjalankan query ke database lokal `ip_intel_cache` dan `ip_intel_events`. Berjalan seketika tanpa koneksi internet dan tanpa mengurangi kuota provider.
- `Enrich All` — Memproses batch masukan (hingga 200 IP). Menggunakan cache lokal jika masih segar (`fresh-first`), dan melakukan request ke provider jika data belum ada atau sudah usang (> 7 hari).

### Universal Clipboard Architecture (lib/clipboard.ts)
```typescript
// lib/clipboard.ts — Dual-mode fallback untuk insecure context (HTTP LAN)
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // 1. Coba modern Async Clipboard API jika tersedia (HTTPS / localhost)
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* Fallback ke textarea jika permission ditolak */ }
  }

  // 2. Fallback sinkron untuk HTTP pada LAN (e.g. http://10.20.100.117:3000)
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return Boolean(successful);
  } catch {
    return false;
  }
}
```

### Algoritma Perangkingan Ancaman (sortInvestigationResults)
Hasil investigasi diurutkan secara deterministik berdasarkan tingkat keparahan vonis, skor, dan jumlah alert, dengan indikator lokal ditaruh di posisi paling bawah:

```typescript
// components/investigation/investigation-state.ts
const VERDICT_SEVERITY = { 'Malicious': 4, 'Suspicious': 3, 'Low risk': 2, 'Unknown': 1 };

export function sortInvestigationResults(results: InvestigationResult[]): InvestigationResult[] {
  return [...results].sort((a, b) => {
    const aLocal = isLocalIndicator(a);
    const bLocal = isLocalIndicator(b);

    // 1. IP Lokal selalu berada di posisi paling dasar
    if (aLocal && !bLocal) return 1;
    if (!aLocal && bLocal) return -1;
    if (aLocal && bLocal) return a.ip.localeCompare(b.ip, undefined, { numeric: true });

    // 2. Urutkan berdasarkan keparahan Vonis (Malicious -> Suspicious -> Low risk -> Unknown)
    const aSev = VERDICT_SEVERITY[a.verdict ?? 'Unknown'] ?? 0;
    const bSev = VERDICT_SEVERITY[b.verdict ?? 'Unknown'] ?? 0;
    if (bSev !== aSev) return bSev - aSev;

    // 3. Urutkan berdasarkan Skor Komposit (menurun)
    const aScore = a.compositeScore ?? a.abuseScore ?? 0;
    const bScore = b.compositeScore ?? b.abuseScore ?? 0;
    if (bScore !== aScore) return bScore - aScore;

    // 4. Tie-breaker: total alert count lokal
    const aAlerts = a.totalAlertCount ?? 0;
    const bAlerts = b.totalAlertCount ?? 0;
    if (bAlerts !== aAlerts) return bAlerts - aAlerts;

    return a.ip.localeCompare(b.ip, undefined, { numeric: true });
  });
}
```

---

## 7. Integrasi Teknis dengan Charlie Reporter (n8n)

### Posisi dalam Workflow n8n
Charlie Reporter memproses raw alert dari Wazuh (NDJSON atau OpenSearch hits). Di dalam node `Enrich Attack Indicators.js`, n8n mengekstrak seluruh source IP penyerang dan memanggil Neuropetra Sidecar (:8899) sebelum memanggil API eksternal.

### Microservice Neuropetra Sidecar (:8899)
Microservice `neuropetra-sidecar/server.js` adalah service Node.js ringan yang berjalan berdampingan dengan n8n. Tugasnya melayani request intensif n8n langsung ke PostgreSQL melalui koneksi pool berkecepatan tinggi.

### Kontrak Endpoint Sidecar
- `GET /ip-intel?ips=1.2.3.4,5.6.7.8` — Mengambil data reputasi dan telemetri lokal yang masih segar (<= 7 hari). Jika ditemukan dalam cache, n8n tidak perlu memanggil AbuseIPDB, memangkas waktu dari 2 menit menjadi < 2 detik.
- `POST /ip-intel` — Menerima payload alert yang diproses n8n, secara atomik memperbarui `last_seen`, menaikkan `total_alert_count`, menggabungkan taktik MITRE dan endpoint unik, serta mencatat entri log forensik baru ke `ip_intel_events`.

---

## 8. Format Standar Pelaporan IoC (ASOC Specification)

### Spesifikasi 5 Kolom Tabel IoC
Pustaka `lib/charlie-ioc-formatter.ts` menghasilkan tabel Markdown yang 100% patuh terhadap standar resmi **Template Report ASOC.md (Seksi 4.2: INDICATOR OF COMPROMISE)**:

| Tipe IoC | Nilai | Negara (ASN) | AbuseIPDB | Keterangan |
| :--- | :--- | :--- | :--- | :--- |
| IP Address | 172.81.132.189 | United States (Hostwinds LLC) | 100% (High Threat) | Teramati melakukan aktivitas sql_injection (14 request) |
| IP Address | 192.168.1.50 | Local Network (Private IP RFC1918) | N/A | Target host internal terdeteksi |
| SHA-256 | e3b0c44298fc... | N/A | N/A | Payload hash terdeteksi pada alert Wazuh |

### Fungsi Normalisasi & Klasifikasi
- `getFullCountryName(code)` — Mengubah kode ISO 2-huruf/3-huruf menjadi nama negara lengkap bahasa Inggris (US → United States, ID → Indonesia) via `Intl.DisplayNames`.
- `classifyThreatScore(score)` — Mengelompokkan persentase skor menjadi label resmi: >= 75% High Threat, 40-74% Medium Threat, 1-39% Low Threat, 0% Clean/Whitelisted, dan Not Enriched.

---

## 9. Otomatisasi Blocklist Feeds (Wazuh CDB)

### Endpoint /api/blocklist & Format CDB
Neuropetra mengekspor feed indikator ancaman terverifikasi melalui `/api/blocklist`. Autentikasi menggunakan Machine Feed Token (Bearer token 43-karakter ter-hash) dengan scope `feed:read`.

Format CDB (`?format=cdb`) menghasilkan daftar pasangan `IP:skor` yang siap disinkronkan langsung ke file `/var/ossec/etc/lists/` pada Wazuh Manager untuk keperluan Active Response blocking.

### Siklus Umpan Balik Tertutup (Closed-Loop Defense)
```text
1. Penyerang melancarkan probe/exploit web
   │
   ▼
2. Wazuh Agent mendeteksi anomali & mencatat log HTTP
   │
   ▼
3. n8n Charlie Reporter menerima raw alert & query Sidecar (:8899)
   │
   ▼
4. n8n & Red Sage 8B menghasilkan laporan insiden (Tabel IoC Neuropetra)
   │
   ▼
5. Database Neuropetra mengakumulasikan skor & memasukkan IP ke feed blocklist
   │
   ▼
6. Wazuh Manager menarik feed CDB (/api/blocklist?format=cdb)
   │
   ▼
7. Active Response secara otomatis memblokir IP penyerang di perimeter firewall!
```

---

## 10. Scoped Database Maintenance & Retensi Data

### Siklus 1-Run Retention Plan
Tidak ada scheduler latar belakang yang menghapus data secara otomatis. Setiap tindakan retensi harus melalui alur terverifikasi: Admin membuat rencana (Plan) dengan kriteria tanggal cutoff, sistem mengunci snapshot (Preview), Admin melakukan konfirmasi dengan kata sandi (Re-auth), dan sistem mengeksekusi penghapusan secara atomik di bawah koneksi berizin khusus `ip_intel_maintenance`.

### Audit Trail Append-Only
Setiap tindakan maintenance dicatat ke dalam tabel `ip_intel_maintenance_audit`. Aplikasi web tidak memiliki hak akses UPDATE atau DELETE pada tabel audit ini, memastikan kepatuhan regulasi dan akuntabilitas forensik.

---

## 11. Error Handling, Rate Limiting & Recovery

### Jenis Error & Kode Respons API
| Kode HTTP | Jenis Error | Keterangan & Tindakan Penanganan |
| :--- | :--- | :--- |
| 400 | `ApiInputError` | Format IP tidak valid, subnet tidak didukung, atau jumlah IP melebihi batas 200. |
| 401 | `AuthError` | Sesi kedaluwarsa, cookie hilang, atau token feed tidak valid / telah dicabut. |
| 403 | `PermissionError` | Role akun (`analyst`) tidak memiliki izin untuk tindakan terkait (`admin` required). |
| 429 | `RateLimitError` | Request melampaui kuota token bucket (misal: enrich limit 30 req/min). Coba lagi setelah jeda. |
| 500 | `DatabaseError` | Koneksi database terputus atau constraint database dilanggar. Periksa log Docker. |
| 503 | `ProviderError` | API AbuseIPDB eksternal down atau timeout. Sistem fallback ke cache lokal. |

### Rate Limiter Token Bucket
Endpoint investigasi eksternal (`/api/enrich`) dilindungi oleh in-memory token bucket rate limiter per-user (`enrich:${userId}`, kapasitas 30 token, refill 0.5/detik) guna melindungi kuota AbuseIPDB dari lonjakan tak terkontrol.

---

## 12. Deployment, Jaringan & Troubleshooting

### Menjalankan Neuropetra (Rute A vs Rute B)
```bash
# Rute A: Bundled PostgreSQL dengan Docker Compose
docker compose --env-file .runtime/secrets/compose.env \
  -f docker-compose.yml -f compose.postgres.yml -f compose.operator.yml \
  up -d postgres provision migrate account app

# Rute B: Dedicated Database pada server PostgreSQL mandiri
# 1. Konfigurasi kredensial per peran pada .runtime/secrets/compose.env
# 2. Jalankan provisioning & migration
pnpm db:provision
pnpm db:migrate
# 3. Jalankan container aplikasi web
docker compose up -d --build app
```

### Mengatasi Konflik AppArmor pada Docker Snap (Ubuntu)
> **Peringatan Lingkungan Lab (soc-lab-wira-117):** Docker yang diinstal via Snap memicu error AppArmor `EPERM` jika opsi `security_opt: [no-new-privileges:true]` diaktifkan. Solusi: Lepaskan direktif tersebut dari compose file agar container profile transitions diizinkan oleh snap daemon.

### Siklus Bootstrap Token & First-Run Setup
Pada instalasi fresh, token acak 32-byte digenerate ke file `.runtime/owner/bootstrap-token` berizin `chmod 600`. Token berlaku selama 30 menit. Operator membuka `http://<IP>:3000/setup` untuk membuat akun admin pertama. Setelah berhasil, token dibersihkan dan route `/setup` dikunci permanen oleh database.

### Checklist Troubleshooting Jaringan & Database
- **Konektivitas Sidecar** — Uji `curl http://<IP-Sidecar>:8899/health`. Wajib membalas `{"ok":true,"pg":"connected"}`.
- **Pemeriksaan Kesiapan Web** — Buka `http://<IP>:3000/api/ready`. Memastikan skema database 001-004 aktif.
- **APP_ORIGIN Mismatch** — Jika login mental atau gagal CSRF, pastikan `APP_ORIGIN` cocok persis dengan URL browser (termasuk protokol dan port).
- **Database Port 5432** — Pastikan container postgres terikat ke jaringan internal Docker, jangan diekspos ke publik.
