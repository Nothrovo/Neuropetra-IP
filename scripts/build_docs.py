#!/usr/bin/env python3
"""
Neuropetra IP Technical Documentation Builder
Conforms 100% to the visual style, structural taxonomy, document control schema,
and typography of Dokumentasi Diptera (SOC-DOC-DIPTERA-001).
Generates DOCX and synchronizes directly to Google Docs via Google Drive API.
"""

import os
import sys
import json
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

DOC_ID = "1j1TdROp4ViEvoOUPSb8OVR4h2iEcaTezwb-_T8JXo1I"
TOKEN_PATH = "/home/nothrovo/.hermes/profiles/nova-johnson/google_token.json"
OUT_DOCX = "/home/nothrovo/Documents/SGU/ip-intel/docs/NEUROPETRA_TECHNICAL_DOCUMENTATION.docx"
OUT_MD = "/home/nothrovo/Documents/SGU/ip-intel/docs/NEUROPETRA_TECHNICAL_DOCUMENTATION.md"

def set_cell_background(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'''
        <w:tcMar {nsdecls("w")}>
            <w:top w:w="{top}" w:type="dxa"/>
            <w:bottom w:w="{bottom}" w:type="dxa"/>
            <w:left w:w="{left}" w:type="dxa"/>
            <w:right w:w="{right}" w:type="dxa"/>
        </w:tcMar>
    ''')
    tcPr.append(tcMar)

def set_table_borders(table, color="D1D5DB", sz="4", val="single"):
    tblPr = table._tbl.tblPr
    borders = parse_xml(f'''
        <w:tblBorders {nsdecls("w")}>
            <w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:left w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:right w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:insideH w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:insideV w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
        </w:tblBorders>
    ''')
    tblPr.append(borders)

def add_single_cell_box(doc, text, is_code=False, bg_color="F9FAFB", border_color="E5E7EB", font_size=9.5):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.cell(0, 0)
    set_cell_background(cell, bg_color)
    set_cell_margins(cell, top=120, bottom=120, left=180, right=180)
    
    # Border
    tcPr = cell._tc.get_or_add_tcPr()
    borders = parse_xml(f'''
        <w:tcBorders {nsdecls("w")}>
            <w:top w:val="single" w:sz="4" w:space="0" w:color="{border_color}"/>
            <w:bottom w:val="single" w:sz="4" w:space="0" w:color="{border_color}"/>
            <w:left w:val="single" w:sz="4" w:space="0" w:color="{border_color}"/>
            <w:right w:val="single" w:sz="4" w:space="0" w:color="{border_color}"/>
        </w:tcBorders>
    ''')
    tcPr.append(borders)

    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.05 if is_code else 1.15
    
    r = p.add_run(text.strip())
    r.font.name = "Consolas" if is_code else "Calibri"
    r.font.size = Pt(font_size)
    r.font.color.rgb = RGBColor(31, 41, 55)

    sp = doc.add_paragraph()
    sp.paragraph_format.space_after = Pt(4)

def add_diptera_table(doc, headers, rows, col_widths=None, header_bg="F2F2F2"):
    num_rows = len(rows) + (1 if headers else 0)
    num_cols = len(headers) if headers else (len(rows[0]) if rows else 0)
    if num_cols == 0:
        return

    tbl = doc.add_table(rows=num_rows, cols=num_cols)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(tbl, color="D1D5DB")

    start_row = 0
    if headers:
        for c_idx, h_text in enumerate(headers):
            cell = tbl.cell(0, c_idx)
            set_cell_background(cell, header_bg)
            set_cell_margins(cell, top=100, bottom=100, left=150, right=150)
            p = cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.1
            r = p.add_run(h_text)
            r.font.name = "Calibri"
            r.font.size = Pt(9.5)
            r.font.bold = True
            r.font.color.rgb = RGBColor(17, 24, 39)
        start_row = 1

    for r_idx, row_vals in enumerate(rows):
        for c_idx, val in enumerate(row_vals):
            cell = tbl.cell(start_row + r_idx, c_idx)
            # Check if this cell should have label bg (like in Document Control col 0 and 2)
            if not headers and (c_idx % 2 == 0):
                set_cell_background(cell, "F2F2F2")
            else:
                set_cell_background(cell, "FFFFFF")
            set_cell_margins(cell, top=90, bottom=90, left=140, right=140)
            p = cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.1
            r = p.add_run(val)
            r.font.name = "Calibri"
            r.font.size = Pt(9.5)
            if not headers and (c_idx % 2 == 0):
                r.font.bold = True
            r.font.color.rgb = RGBColor(31, 41, 55)

    if col_widths:
        for r in tbl.rows:
            for c_idx, w in enumerate(col_widths):
                if c_idx < len(r.cells):
                    r.cells[c_idx].width = w

    sp = doc.add_paragraph()
    sp.paragraph_format.space_after = Pt(4)

def build_neuropetra_doc():
    doc = docx.Document()

    # Section Margins (1 inch)
    for sec in doc.sections:
        sec.top_margin = Inches(1.0)
        sec.bottom_margin = Inches(1.0)
        sec.left_margin = Inches(1.0)
        sec.right_margin = Inches(1.0)

    # Base Normal Style
    normal = doc.styles['Normal']
    normal.font.name = 'Calibri'
    normal.font.size = Pt(11)
    normal.font.color.rgb = RGBColor(17, 24, 39)
    normal.paragraph_format.line_spacing = 1.2
    normal.paragraph_format.space_after = Pt(4)

    # Title & Subtitles (EXACT MATCH WITH DIPTERA)
    p_title = doc.add_paragraph("Neuropetra IP", style='Title')
    p_title.paragraph_format.space_after = Pt(2)

    p_sub1 = doc.add_paragraph("Dokumentasi Teknis", style='Subtitle')
    p_sub1.paragraph_format.space_after = Pt(2)

    p_sub2 = doc.add_paragraph("Threat Intelligence, Telemetry Correlation & IoC Reporting Engine untuk SOC Lab", style='Subtitle')
    p_sub2.paragraph_format.space_after = Pt(12)

    # Classification Banner (EXACT MATCH: 1x1 Table with silver background)
    banner_tbl = doc.add_table(rows=1, cols=1)
    banner_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    banner_cell = banner_tbl.cell(0, 0)
    set_cell_background(banner_cell, "C0C0C0")
    set_cell_margins(banner_cell, top=80, bottom=80, left=140, right=140)
    bp = banner_cell.paragraphs[0]
    bp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    brun = bp.add_run("INTERNAL — SOC Lab   |   Do not share outside authorised named recipients")
    brun.font.name = "Calibri"
    brun.font.size = Pt(9.5)
    brun.font.bold = True
    brun.font.color.rgb = RGBColor(17, 24, 39)
    
    sp_banner = doc.add_paragraph()
    sp_banner.paragraph_format.space_after = Pt(8)

    # DOCUMENT CONTROL (Heading 2)
    doc.add_paragraph("DOCUMENT CONTROL", style='Heading 2')
    doc_control_rows = [
        ["Document name", "Neuropetra IP Technical Documentation", "Classification", "Internal"],
        ["Document ID", "SOC-DOC-NEUROPETRA-001", "Personal data?", "No"],
        ["Version", "1.0", "Owner (Data Owner)", "SOC Lab"],
        ["Status", "Active", "", ""],
        ["Created by / date", "Hadi Nurhasan Darma / 2026-11-13", "Reviewed by / date", ""],
        ["Next review date", "Yearly", "Retention", "Until superseded; secure erase"],
    ]
    add_diptera_table(doc, None, doc_control_rows, [Inches(1.8), Inches(2.2), Inches(1.5), Inches(1.5)])

    # VERSION HISTORY (Heading 2)
    doc.add_paragraph("VERSION HISTORY", style='Heading 2')
    vh_headers = ["Version", "Date", "Author", "Reviewed by", "Summary of change"]
    vh_rows = [
        ["1.0", "2026-11-13", "Hadi Nurhasan Darma", "-", "Initial production technical documentation"]
    ]
    add_diptera_table(doc, vh_headers, vh_rows, [Inches(0.8), Inches(1.2), Inches(1.8), Inches(1.2), Inches(2.0)])

    # Summary Paragraph
    doc.add_paragraph(
        "Dokumen ini menjelaskan cara kerja teknis Neuropetra IP secara end-to-end: arsitektur, komponen inti, "
        "pembagian hak akses database PostgreSQL, protokol korelasi telemetri lokal dan reputasi eksternal, "
        "format pelaporan IoC standar Charlie Reporter (n8n), microservice sidecar, serta mitigasi keamanan operasional."
    )

    # Daftar Isi (Heading 2)
    doc.add_paragraph("Daftar Isi", style='Heading 2')
    toc_items = [
        "Gambaran Umum",
        "Arsitektur & Layout File",
        "Konfigurasi & Environment",
        "Arsitektur Database & Kontrak Hak Akses (PostgreSQL 16)",
        "Telemetri Lokal vs. Reputasi Eksternal (Zero Tampering)",
        "Workflow Investigasi & Threat Ranking Engine",
        "Integrasi Teknis dengan Charlie Reporter (n8n)",
        "Format Standar Pelaporan IoC (ASOC Specification)",
        "Microservice Neuropetra Sidecar (:8899)",
        "Otomatisasi Blocklist Feeds (Wazuh CDB)",
        "Scoped Database Maintenance & Retensi Data",
        "Deployment, Jaringan & Troubleshooting",
    ]
    for item in toc_items:
        p_toc = doc.add_paragraph(item)
        p_toc.paragraph_format.space_after = Pt(2)
    
    doc.add_paragraph() # Spacing

    # ==========================================
    # 1. GAMBARAN UMUM
    # ==========================================
    doc.add_paragraph("1. Gambaran Umum", style='Heading 1')
    doc.add_paragraph("Masalah yang Diselesaikan", style='Heading 2')
    doc.add_paragraph(
        "Dalam operasional SOC, analis keamanan kerap mengalami hambatan saat melakukan triage alamat IP mencurigakan: "
        "intelijen ancaman eksternal sering kali mencampurkan opini provider luar dengan bukti log lokal, sementara data "
        "observasi Wazuh SIEM tercecer dan tidak terhubung secara instan. Selain itu, pemanggilan API reputasi publik "
        "(seperti AbuseIPDB atau VirusTotal) memiliki kuota terbatas dan rentan membocorkan topologi IP privat lokal jika "
        "dilakukan tanpa filter."
    )
    doc.add_paragraph(
        "Neuropetra IP memecahkan masalah ini dengan menjadi sistem investigasi dan korelasi IP tersentralisasi: "
        "menyimpan data telemetri historis (first seen, last seen, jumlah alert, taktik MITRE, payload) secara independen, "
        "menyediakan pencarian lokal instan (sub-milidetik), mengelola cache reputasi eksternal secara hemat kuota, "
        "serta menerbitkan format laporan IoC standar yang langsung selaras dengan generator laporan Charlie Reporter (n8n)."
    )

    doc.add_paragraph("Posisi dalam Ekosistem", style='Heading 2')
    eco_diagram = """
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
"""
    add_single_cell_box(doc, eco_diagram, is_code=True, font_size=8.5)

    add_single_cell_box(
        doc,
        "Penting: Neuropetra menerapkan pemisahan ketat antara observasi lokal dan reputasi eksternal. "
        "Enrichment AbuseIPDB tidak pernah memanipulasi timestamp observasi lokal (first_seen/last_seen) atau "
        "menambah jumlah hitungan alert. Integritas bukti forensik dipertahankan 100%.",
        is_code=False,
        bg_color="EFF6FF",
        border_color="3B82F6"
    )

    # ==========================================
    # 2. ARSITEKTUR & LAYOUT FILE
    # ==========================================
    doc.add_paragraph("2. Arsitektur & Layout File", style='Heading 1')
    doc.add_paragraph("Komponen Utama", style='Heading 2')
    
    file_tree = """
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
"""
    add_single_cell_box(doc, file_tree, is_code=True, font_size=8.5)

    doc.add_paragraph("Peran Tiap File & Modul Inti", style='Heading 2')
    doc.add_paragraph("`lib/clipboard.ts` — Utility penyalinan clipboard universal. Menggunakan modern navigator.clipboard di secure context (HTTPS/localhost), dan secara mulus beralih ke DOM textarea fallback (execCommand) saat diakses melalui HTTP LAN (10.20.100.117). Mencegah crash salin IP di browser analis.")
    doc.add_paragraph("`lib/charlie-ioc-formatter.ts` — Generator tabel IoC standar ASOC (5 kolom) untuk integrasi dengan Charlie Reporter. Menyediakan fungsi normalisasi nama negara (getFullCountryName) dan klasifikasi skor ancaman (classifyThreatScore).")
    doc.add_paragraph("`app/api/enrich/route.ts` — Endpoint enrichment AbuseIPDB massal. Dilengkapi proteksi zero-egress: secara otomatis mencegat alamat non-global/privat dan menandainya sebagai local_private tanpa membocorkan request keluar.")
    doc.add_paragraph("`app/api/blocklist/route.ts` — Endpoint ekspor indikator ancaman dalam format teks murni (TXT), CSV (dengan proteksi formula injection), dan format CDB biner/teks khusus agen Wazuh.")
    doc.add_paragraph("`lib/db.ts` & `lib/db-pool.ts` — Pengelola koneksi PostgreSQL terisolasi. Memisahkan login auth, read telemetri, penulisan reputasi, dan operasi maintenance ke dalam connection pool independen.")

    # ==========================================
    # 3. KONFIGURASI & ENVIRONMENT
    # ==========================================
    doc.add_paragraph("3. Konfigurasi & Environment", style='Heading 1')
    doc.add_paragraph("Alur Injeksi Konfigurasi", style='Heading 2')
    
    cfg_flow = """
Environment Vars (.env / secrets / compose.env)
    │
    ▼ lib/config.ts — fungsi loadConfig()
    │  Membaca nilai langsung atau membaca dari file proteksi (*_FILE)
    │  Memvalidasi integritas APP_ORIGIN dan URL koneksi database
    ▼ Runtime Next.js / Server Actions / API Routes
"""
    add_single_cell_box(doc, cfg_flow, is_code=True, font_size=8.5)

    doc.add_paragraph("Variabel Environment", style='Heading 2')
    env_headers = ["Var", "Default", "Keterangan"]
    env_rows = [
        ["APP_ORIGIN", "http://127.0.0.1:3000", "Origin kanonikal browser. HTTP diizinkan untuk loopback dan private LAN (RFC 1918/4193); domain publik WAJIB HTTPS."],
        ["AUTH_DATABASE_URL", "(wajib)", "Koneksi database khusus manajemen user, sesi scrypt, dan throttling."],
        ["READ_DATABASE_URL", "(wajib)", "Koneksi read-only murni untuk query telemetri cache, events, dan reputasi."],
        ["REPUTATION_DATABASE_URL", "(wajib)", "Koneksi writer khusus ke tabel reputasi ip_intel_reputation."],
        ["MAINTENANCE_DATABASE_URL", "(opsional)", "Koneksi berhak khusus untuk eksekusi job invalidasi retensi reputasi."],
        ["ENABLE_EXTERNAL_ENRICHMENT", "false", "Master toggle fitur enrichment AbuseIPDB. Wajib diset true untuk mengaktifkan pemanggilan live API."],
        ["ABUSEIPDB_API_KEY", "(opsional)", "API key AbuseIPDB server-side (dapat juga dikelola langsung via Web UI)."],
        ["USE_MOCK_DATA", "false", "Menyediakan telemetri sintetis untuk testing/CI tanpa memotong autentikasi PostgreSQL."],
        ["APP_PORT", "3000", "Port listening container/host."],
        ["APP_BIND_IP", "0.0.0.0", "Binding interface jaringan (gunakan 127.0.0.1 bila di balik reverse proxy lokal)."],
    ]
    add_diptera_table(doc, env_headers, env_rows, [Inches(2.2), Inches(1.6), Inches(3.2)])

    add_single_cell_box(
        doc,
        "Penting: Jangan gunakan DATABASE_URL umum. Neuropetra menolak koneksi monolitik dan mewajibkan "
        "koneksi terpisah (AUTH, READ, REPUTATION, MAINTENANCE) guna menegakkan prinsip Least Privilege.",
        is_code=False,
        bg_color="FEF3C7",
        border_color="F59E0B"
    )

    # ==========================================
    # 4. ARSITEKTUR DATABASE & KONTRAK HAK AKSES
    # ==========================================
    doc.add_paragraph("4. Arsitektur Database & Kontrak Hak Akses (PostgreSQL 16)", style='Heading 1')
    doc.add_paragraph("Matriks 5 Peran Database", style='Heading 2')
    doc.add_paragraph(
        "Interaksi dengan database PostgreSQL 16 diatur oleh lima login identity independen dengan batasan hak akses ketat:"
    )

    db_headers = ["Identitas Login", "Grup Runtime", "Hak Akses & Lingkup Operasi"]
    db_rows = [
        ["ip_intel_migration_login", "(None)", "Pemilik objek/skema; menjalankan file migrasi DDL NNN_name.sql. Dilarang dimount ke web app."],
        ["ip_intel_auth_login", "ip_intel_auth", "SELECT/INSERT/UPDATE/DELETE pada user, sesi, dan auth attempts. SELECT feed tokens."],
        ["ip_intel_read_login", "ip_intel_read", "SELECT murni pada cache telemetri, events, reputasi, dan audit. Tidak ada izin write."],
        ["ip_intel_reputation_login", "ip_intel_reputation", "SELECT/INSERT/UPDATE pada tabel reputasi dan USAGE sequence. Dilarang modifikasi telemetri."],
        ["ip_intel_maintenance_login", "ip_intel_maintenance", "Khusus eksekusi rencana retensi reputasi, update status plan, dan penulisan audit."],
    ]
    add_diptera_table(doc, db_headers, db_rows, [Inches(1.8), Inches(1.4), Inches(3.8)])

    doc.add_paragraph("Skema Data Telemetri Lokal", style='Heading 2')
    doc.add_paragraph("Tabel telemetri merefleksikan hasil observasi internal aktual tanpa modifikasi dari luar:")
    
    cache_schema = """
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
"""
    add_single_cell_box(doc, cache_schema, is_code=True, font_size=8.0)

    doc.add_paragraph("Sequence Monotonik & Proteksi ABA", style='Heading 2')
    doc.add_paragraph(
        "Tabel reputasi mandiri (`ip_intel_reputation`) dilengkapi kolom `revision bigint NOT NULL DEFAULT 1` "
        "yang dikendalikan oleh trigger sequence `ip_intel_reputation_revision_seq`. Setiap mutasi menambah nomor revisi, "
        "sehingga job maintenance/retensi dapat mengunci snapshot data secara konsisten dan menolak eksekusi bila terjadi "
        "perubahan data di tengah-tengah proses (pencegahan ABA Problem)."
    )

    # ==========================================
    # 5. TELEMETRI LOKAL VS REPUTASI EKSTERNAL
    # ==========================================
    doc.add_paragraph("5. Telemetri Lokal vs. Reputasi Eksternal (Zero Tampering)", style='Heading 1')
    doc.add_paragraph("Integritas Forensik Bukti Log", style='Heading 2')
    doc.add_paragraph(
        "Di banyak platform intelijen, ketika analis melakukan pencarian IP eksternal, sistem secara otomatis "
        "membuat record tiruan seolah-olah IP tersebut telah menyerang jaringan. Neuropetra menolak pendekatan cacat ini."
    )
    doc.add_paragraph(
        "Tabel `ip_intel_cache` (observasi lokal) dan `ip_intel_reputation` (intelijen eksternal) dipisahkan total. "
        "Reputasi pihak ketiga tidak pernah memanipulasi timestamp observasi lokal (first_seen/last_seen) atau menambah "
        "hitungan total_alert_count. Jika suatu IP hanya di-enrich dari AbuseIPDB tanpa ada log lokal, IP tersebut "
        "hanya tersimpan di tabel reputasi."
    )

    doc.add_paragraph("Normalisasi Skor Reputasi", style='Heading 2')
    doc.add_paragraph(
        "Indikator reputasi mandiri yang belum pernah terlihat dalam telemetri lokal secara dinamis dinormalisasi "
        "skor kompositnya tanpa penalti unobserved telemetry. Skor ancaman dihitung dari data AbuseIPDB, sedangkan "
        "status lokal tetap diberi label 'Local miss' atau 'Reputation only'."
    )

    # ==========================================
    # 6. WORKFLOW INVESTIGASI & THREAT RANKING
    # ==========================================
    doc.add_paragraph("6. Workflow Investigasi & Threat Ranking Engine", style='Heading 1')
    doc.add_paragraph("Mode Pencarian (Search Local vs Enrich All)", style='Heading 2')
    doc.add_paragraph("`Search Local` — Menjalankan query ke database lokal ip_intel_cache dan ip_intel_events. Berjalan seketika tanpa koneksi internet dan tanpa mengurangi kuota provider.")
    doc.add_paragraph("`Enrich All` — Memproses batch masukan (hingga 200 IP). Menggunakan cache lokal jika masih segar (fresh-first), dan melakukan request ke provider jika data belum ada atau sudah usang (> 7 hari).")

    doc.add_paragraph("Universal Clipboard Architecture (lib/clipboard.ts)", style='Heading 2')
    clip_code = """
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
"""
    add_single_cell_box(doc, clip_code, is_code=True, font_size=8.0)

    doc.add_paragraph("Algoritma Perangkingan Ancaman (sortInvestigationResults)", style='Heading 2')
    doc.add_paragraph(
        "Hasil investigasi diurutkan secara deterministik berdasarkan tingkat keparahan vonis, skor, dan jumlah alert, "
        "dengan indikator lokal ditaruh di posisi paling bawah:"
    )
    
    sort_code = """
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
"""
    add_single_cell_box(doc, sort_code, is_code=True, font_size=8.0)

    # ==========================================
    # 7. INTEGRASI TEKNIS DENGAN CHARLIE REPORTER
    # ==========================================
    doc.add_paragraph("7. Integrasi Teknis dengan Charlie Reporter (n8n)", style='Heading 1')
    doc.add_paragraph("Posisi dalam Workflow n8n", style='Heading 2')
    doc.add_paragraph(
        "Charlie Reporter memproses raw alert dari Wazuh (NDJSON atau OpenSearch hits). "
        "Di dalam node `Enrich Attack Indicators.js`, n8n mengekstrak seluruh source IP penyerang dan memanggil "
        "Neuropetra Sidecar (:8899) sebelum memanggil API eksternal."
    )

    doc.add_paragraph("Microservice Neuropetra Sidecar (:8899)", style='Heading 2')
    doc.add_paragraph(
        "Microservice `neuropetra-sidecar/server.js` adalah service Node.js ringan yang berjalan berdampingan dengan n8n. "
        "Tugasnya melayani request intensif n8n langsung ke PostgreSQL melalui koneksi pool berkecepatan tinggi."
    )

    doc.add_paragraph("Kontrak Endpoint Sidecar", style='Heading 2')
    doc.add_paragraph("`GET /ip-intel?ips=1.2.3.4,5.6.7.8` — Mengambil data reputasi dan telemetri lokal yang masih segar (<= 7 hari). Jika ditemukan dalam cache, n8n tidak perlu memanggil AbuseIPDB, memangkas waktu dari 2 menit menjadi < 2 detik.")
    doc.add_paragraph("`POST /ip-intel` — Menerima payload alert yang diproses n8n, secara atomik memperbarui last_seen, menaikkan total_alert_count, menggabungkan taktik MITRE dan endpoint unik, serta mencatat entri log forensik baru ke ip_intel_events.")

    # ==========================================
    # 8. FORMAT STANDAR PELAPORAN IOC
    # ==========================================
    doc.add_paragraph("8. Format Standar Pelaporan IoC (ASOC Specification)", style='Heading 1')
    doc.add_paragraph("Spesifikasi 5 Kolom Tabel IoC", style='Heading 2')
    doc.add_paragraph(
        "Pustaka `lib/charlie-ioc-formatter.ts` menghasilkan tabel Markdown yang 100% patuh terhadap standar resmi "
        "Template Report ASOC.md (Seksi 4.2: INDICATOR OF COMPROMISE):"
    )

    ioc_headers = ["Tipe IoC", "Nilai", "Negara (ASN)", "AbuseIPDB", "Keterangan"]
    ioc_rows = [
        ["IP Address", "172.81.132.189", "United States (Hostwinds LLC)", "100% (High Threat)", "Teramati melakukan aktivitas sql_injection (14 request)"],
        ["IP Address", "192.168.1.50", "Local Network (Private IP RFC1918)", "N/A", "Target host internal terdeteksi"],
        ["SHA-256", "e3b0c44298fc1c149afb...", "N/A", "N/A", "Payload hash terdeteksi pada alert Wazuh"],
    ]
    add_diptera_table(doc, ioc_headers, ioc_rows, [Inches(1.2), Inches(1.5), Inches(1.8), Inches(1.2), Inches(1.8)])

    doc.add_paragraph("Fungsi Normalisasi & Klasifikasi", style='Heading 2')
    doc.add_paragraph("`getFullCountryName(code)` — Mengubah kode ISO 2-huruf/3-huruf menjadi nama negara lengkap bahasa Inggris (US → United States, ID → Indonesia) via Intl.DisplayNames.")
    doc.add_paragraph("`classifyThreatScore(score)` — Mengelompokkan persentase skor menjadi label resmi: >= 75% High Threat, 40-74% Medium Threat, 1-39% Low Threat, 0% Clean/Whitelisted, dan Not Enriched.")

    # ==========================================
    # 9. OTOMATISASI BLOCKLIST FEEDS
    # ==========================================
    doc.add_paragraph("9. Otomatisasi Blocklist Feeds (Wazuh CDB)", style='Heading 1')
    doc.add_paragraph("Endpoint /api/blocklist & Format CDB", style='Heading 2')
    doc.add_paragraph(
        "Neuropetra mengekspor feed indikator ancaman terverifikasi melalui `/api/blocklist`. "
        "Autentikasi menggunakan Machine Feed Token (Bearer token 43-karakter ter-hash) dengan scope `feed:read`."
    )
    doc.add_paragraph("Format CDB (`?format=cdb`) menghasilkan daftar pasangan `IP:skor` yang siap disinkronkan langsung ke file `/var/ossec/etc/lists/` pada Wazuh Manager untuk keperluan Active Response blocking.")

    doc.add_paragraph("Siklus Umpan Balik Tertutup (Closed-Loop Defense)", style='Heading 2')
    loop_diagram = """
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
"""
    add_single_cell_box(doc, loop_diagram, is_code=True, font_size=8.5)

    # ==========================================
    # 10. SCOPED DATABASE MAINTENANCE
    # ==========================================
    doc.add_paragraph("10. Scoped Database Maintenance & Retensi Data", style='Heading 1')
    doc.add_paragraph("Siklus 1-Run Retention Plan", style='Heading 2')
    doc.add_paragraph(
        "Tidak ada scheduler latar belakang yang menghapus data secara otomatis. "
        "Setiap tindakan retensi harus melalui alur terverifikasi: Admin membuat rencana (Plan) dengan kriteria tanggal cutoff, "
        "sistem mengunci snapshot (Preview), Admin melakukan konfirmasi dengan kata sandi (Re-auth), dan sistem mengeksekusi "
        "penghapusan secara atomik di bawah koneksi berizin khusus `ip_intel_maintenance`."
    )

    doc.add_paragraph("Audit Trail Append-Only", style='Heading 2')
    doc.add_paragraph(
        "Setiap tindakan maintenance dicatat ke dalam tabel `ip_intel_maintenance_audit`. "
        "Aplikasi web tidak memiliki hak akses UPDATE atau DELETE pada tabel audit ini, memastikan kepatuhan regulasi dan "
        "akuntabilitas forensik."
    )

    # ==========================================
    # 11. ERROR HANDLING, RATE LIMITING & RECOVERY
    # ==========================================
    doc.add_paragraph("11. Error Handling, Rate Limiting & Recovery", style='Heading 1')
    doc.add_paragraph("Jenis Error & Kode Respons API", style='Heading 2')
    
    err_headers = ["Kode HTTP", "Jenis Error", "Keterangan & Tindakan Penanganan"]
    err_rows = [
        ["400", "ApiInputError", "Format IP tidak valid, subnet tidak didukung, atau jumlah IP melebihi batas 200."],
        ["401", "AuthError", "Sesi kedaluwarsa, cookie hilang, atau token feed tidak valid / telah dicabut."],
        ["403", "PermissionError", "Role akun (analyst) tidak memiliki izin untuk tindakan terkait (admin required)."],
        ["429", "RateLimitError", "Request melampaui kuota token bucket (misal: enrich limit 30 req/min). Coba lagi setelah jeda."],
        ["500", "DatabaseError", "Koneksi database terputus atau constraint database dilanggar. Periksa log Docker."],
        ["503", "ProviderError", "API AbuseIPDB eksternal down atau timeout. Sistem fallback ke cache lokal."],
    ]
    add_diptera_table(doc, err_headers, err_rows, [Inches(1.0), Inches(1.6), Inches(4.4)])

    doc.add_paragraph("Rate Limiter Token Bucket", style='Heading 2')
    doc.add_paragraph(
        "Endpoint investigasi eksternal (`/api/enrich`) dilindungi oleh in-memory token bucket rate limiter "
        "per-user (`enrich:${userId}`, kapasitas 30 token, refill 0.5/detik) guna melindungi kuota AbuseIPDB dari lonjakan tak terkontrol."
    )

    # ==========================================
    # 12. DEPLOYMENT, JARINGAN & TROUBLESHOOTING
    # ==========================================
    doc.add_paragraph("12. Deployment, Jaringan & Troubleshooting", style='Heading 1')
    doc.add_paragraph("Menjalankan Neuropetra (Rute A vs Rute B)", style='Heading 2')
    
    deploy_cmd = """
# Rute A: Bundled PostgreSQL dengan Docker Compose
docker compose --env-file .runtime/secrets/compose.env \\
  -f docker-compose.yml -f compose.postgres.yml -f compose.operator.yml \\
  up -d postgres provision migrate account app

# Rute B: Dedicated Database pada server PostgreSQL mandiri
# 1. Konfigurasi kredensial per peran pada .runtime/secrets/compose.env
# 2. Jalankan provisioning & migration
pnpm db:provision
pnpm db:migrate
# 3. Jalankan container aplikasi web
docker compose up -d --build app
"""
    add_single_cell_box(doc, deploy_cmd, is_code=True, font_size=8.5)

    doc.add_paragraph("Mengatasi Konflik AppArmor pada Docker Snap (Ubuntu)", style='Heading 2')
    add_single_cell_box(
        doc,
        "Peringatan Lingkungan Lab (soc-lab-wira-117): Docker yang diinstal via Snap memicu error AppArmor "
        "EPERM jika opsi security_opt: [no-new-privileges:true] diaktifkan. Solusi: Lepaskan direktif tersebut "
        "dari compose file agar container profile transitions diizinkan oleh snap daemon.",
        is_code=False,
        bg_color="FEF2F2",
        border_color="EF4444"
    )

    doc.add_paragraph("Siklus Bootstrap Token & First-Run Setup", style='Heading 2')
    doc.add_paragraph(
        "Pada instalasi fresh, token acak 32-byte digenerate ke file `.runtime/owner/bootstrap-token` berizin `chmod 600`. "
        "Token berlaku selama 30 menit. Operator membuka `http://<IP>:3000/setup` untuk membuat akun admin pertama. "
        "Setelah berhasil, token dibersihkan dan route `/setup` dikunci permanen oleh database."
    )

    doc.add_paragraph("Checklist Troubleshooting Jaringan & Database", style='Heading 2')
    doc.add_paragraph("Konektivitas Sidecar — Uji `curl http://<IP-Sidecar>:8899/health`. Wajib membalas `{\"ok\":true,\"pg\":\"connected\"}`.")
    doc.add_paragraph("Pemeriksaan Kesiapan Web — Buka `http://<IP>:3000/api/ready`. Memastikan skema database 001-004 aktif.")
    doc.add_paragraph("APP_ORIGIN Mismatch — Jika login mental atau gagal CSRF, pastikan APP_ORIGIN cocok persis dengan URL browser (termasuk protokol dan port).")
    doc.add_paragraph("Database Port 5432 — Pastikan container postgres terikat ke jaringan internal Docker, jangan diekspos ke publik.")

    # Save DOCX
    doc.save(OUT_DOCX)
    print(f"Successfully built DOCX at: {OUT_DOCX}")

def sync_to_google_docs():
    print(f"Authenticating with Google Drive API...")
    with open(TOKEN_PATH, 'r', encoding='utf-8') as f:
        token_data = json.load(f)

    creds = Credentials(
        token=token_data.get('token'),
        refresh_token=token_data.get('refresh_token'),
        token_uri=token_data.get('token_uri', 'https://oauth2.googleapis.com/token'),
        client_id=token_data.get('client_id'),
        client_secret=token_data.get('client_secret'),
        scopes=token_data.get('scopes')
    )

    drive = build('drive', 'v3', credentials=creds)
    docs = build('docs', 'v1', credentials=creds)

    print(f"Updating Google Doc {DOC_ID} from {OUT_DOCX}...")
    media = MediaFileUpload(OUT_DOCX, mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res = drive.files().update(fileId=DOC_ID, media_body=media).execute()
    print("Drive update response:", res)

    print("Verifying structural elements in Google Doc...")
    doc_res = docs.documents().get(documentId=DOC_ID).execute()
    content = doc_res.get('body', {}).get('content', [])
    
    headings = []
    tables = 0
    for el in content:
        if 'paragraph' in el:
            p = el['paragraph']
            style = p.get('paragraphStyle', {}).get('namedStyleType', 'NORMAL_TEXT')
            text = ''.join([e.get('textRun', {}).get('content', '') for e in p.get('elements', [])]).strip()
            if 'HEADING' in style or style == 'TITLE' or style == 'SUBTITLE':
                headings.append((style, text[:60]))
        elif 'table' in el:
            tables += 1

    print(f"Verified Google Doc: {len(headings)} Headings/Titles, {tables} Tables.")
    for h in headings[:15]:
        print(f"  [{h[0]}] {h[1]}")

if __name__ == '__main__':
    build_neuropetra_doc()
    sync_to_google_docs()
