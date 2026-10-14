# IP Intel — ACAD CSIRT Threat Intelligence Platform

Internal, AbuseIPDB-style threat-intelligence lookup and attack telemetry web application for the SOC team, built natively on top of PostgreSQL (`abuseip`).

---

## 🚀 Key Features

- **Read-Only Telemetry Exploration**: Integrates directly with `ip_intel_cache` and `ip_intel_events` without modifying existing incident records.
- **Dynamic Threat Verdict Engine**: Composite score (0–100) combining AbuseIPDB confidence, VirusTotal malicious detection ratios, and local SOC signals (alert volume log-scale, target spread, recency decay, and critical outcome detection).
- **MITRE ATT&CK® Enterprise Matrix Mapping**: Normalizes observed technique IDs (`T1595.002`, `T1190`, `T1055`, `T1083`, `T1498`) to enterprise tactical objectives.
- **Granular Incident Timeline & Forensics**: Per-day attack frequency charts (30d/90d) and paginated event table with plain-text log expansion (zero XSS vulnerability).
- **Bulk IP Investigation**: Batch lookup supporting newline/comma-separated IPs and CSV file uploads with instantaneous CSV export.
- **Multi-Format Blocklist Feeds**: Generate live dynamic threat feeds formatted for Firewalls (TXT), Spreadsheets (CSV), and Wazuh CDB-lists (`ip:desc`) for `/var/ossec/etc/lists/`.
- **Zero-Dependency Mock Mode**: Instant local development with `USE_MOCK_DATA=true` without requiring a production database connection.

---

## 🛠️ Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Styling**: Tailwind CSS (SOC Dark Theme: `slate-950`, `cyan-400`, `red-500`, `amber-400`, `emerald-400`)
- **State & Data Fetching**: TanStack React Query
- **Charts**: Recharts
- **Database Client**: `pg` with connection pooling and strictly parameterized `SELECT` queries
- **Testing**: Vitest unit test suite

---

## 🔒 Security Best Practices & Read-Only Role

The application connects to PostgreSQL using a strictly read-only role. To create the read-only user in PostgreSQL:

```sql
-- 1. Create a dedicated read-only role
CREATE ROLE soc_readonly WITH LOGIN PASSWORD 'YourSecurePasswordHere';

-- 2. Grant connection and schema usage
GRANT CONNECT ON DATABASE abuseip TO soc_readonly;
\c abuseip
GRANT USAGE ON SCHEMA public TO soc_readonly;

-- 3. Grant SELECT privileges only on the two tables
GRANT SELECT ON ip_intel_cache TO soc_readonly;
GRANT SELECT ON ip_intel_events TO soc_readonly;

-- 4. Set transaction defaults to read-only
ALTER ROLE soc_readonly SET default_transaction_read_only = on;
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

| Variable | Default | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://soc_readonly:REDACTED_PASSWORD@127.0.0.1:5432/abuseip` | Connection string to the PostgreSQL database. |
| `USE_MOCK_DATA` | `false` | When `true`, uses synthetic in-memory telemetry without connecting to DB. |
| `PORT` | `3001` | Host port for Docker Compose and local web server. |
| `AUTH_USER` | `analyst` | Default SOC analyst username. |
| `AUTH_PASS` | `soc123` | Default SOC analyst password. |
| `ENABLE_RECHECK`| `false` | Feature flag for the sidecar re-check button. Kept false to protect audit logs. |

---

## 🚀 Running the Application

### Option A: Local Development

```bash
# 1. Install dependencies
pnpm install

# 2. Run unit tests
pnpm test

# 3. Start development server
pnpm dev -p 3001
```

Access the web interface at **`http://localhost:3001`** (Login: `analyst` / `soc123`).

### Option B: Docker Compose

```bash
# Build and run the web container
docker compose up -d --build

# Inspect logs
docker compose logs -f ip-intel-web
```

---

## 🧪 Testing & Mock Mode

### Running Automated Unit Tests
```bash
pnpm test
```
Runs 14 unit tests covering:
- Threat verdict score calculations, missing-source re-normalizations, and critical outcome bonuses.
- IPv4, IPv6, and CIDR validations.
- Safe defanging utility (`198.51.100[.]23`, `hxxps://`).
- MITRE ATT&CK technique normalization and tactical matrix grouping.

### Using Mock Mode
To test all UI features without PostgreSQL:
```bash
USE_MOCK_DATA=true pnpm dev -p 3001
```

To seed an empty development PostgreSQL instance with synthetic data:
```bash
npx tsx scripts/seed-mock.ts
```

---

## 📚 Technical Documentation

- **Database Schema & Index Tuning**: Refer to [`docs/DB_SCHEMA.md`](docs/DB_SCHEMA.md) for table schemas, data type mappings, and index recommendations (`CREATE INDEX CONCURRENTLY ... USING gin`).
