# Phoenix Zero Sovereign — Demo Readiness / Status

> **Status:** Production-ready (validated on Render)
>
> **Production Base URL:** https://phoenix-zero-web.onrender.com

---

## 1) Landing Pages (4 verticals)

- **Exchange:** https://phoenix-zero-web.onrender.com/for-exchanges
- **AI Marketplace:** https://phoenix-zero-web.onrender.com/for-ai-marketplaces
- **Gaming:** https://phoenix-zero-web.onrender.com/for-gaming
- **Banking:** https://phoenix-zero-web.onrender.com/for-banking

---

## 2) Real Business Data Demo Endpoint

- **Endpoint:** `POST /api/demo/run-with-data`
- **Auth header:** `x-demo-run-token: <PHOENIX_ZERO_DEMO_RUN_TOKEN>`
- **Multipart fields:**
  - `demoType`: `exchange | ai-marketplace | gaming | banking`
  - `mode`: `auto | batch | transaction` (optional; default: `auto`)
  - `file`: CSV/JSON file upload (preferred)
  - `dataFile`: CSV/JSON file upload (legacy; still supported)
  - `rawText`: raw string (optional)

---

## 3) Hybrid Modes & Volume Limits

### `mode=transaction`

- **What it does:** generates **1 proof per row** (small volumes)
- **Safety limit:** executes up to **25 rows**
- **Response:** includes `transactionResults[]`

### `mode=batch`

- **What it does:** generates **1 proof per file** + enterprise rollup
- **Safety limit:** `batchSummary` aggregation runs up to **5000 rows** (CPU bounded)
- **Response:** includes `batchSummary`

### `mode=auto`

- **Default behavior:** chooses `transaction` for small files and `batch` for large files

---

## 4) Enterprise Template Downloads (CSV)

Templates are served as static downloads:

- **Exchange:** https://phoenix-zero-web.onrender.com/templates/exchange_settlement_template.csv
- **AI Marketplace:** https://phoenix-zero-web.onrender.com/templates/ai_marketplace_enterprise.csv
- **Gaming:** https://phoenix-zero-web.onrender.com/templates/gaming_enterprise.csv
- **Banking:** https://phoenix-zero-web.onrender.com/templates/banking_enterprise.csv

---

## 5) Production Validation (Render)

Validated end-to-end on production:

- **Exchange:** `batch` + `transaction` OK
- **AI Marketplace:** `batch` + `transaction` OK
- **Gaming:** `batch` + `transaction` OK
- **Banking:** `batch` + `transaction` OK

Validation criteria:

- `success: true`
- `mode` matches requested mode
- **Batch:** `batchSummary` present
- **Transaction:** `transactionResults.length > 0`
- `verifyUrl` loads
- `publicProofUrl` responds

---

## 6) Expected Response (shape)

High-level response fields (varies slightly by mode):

- `success`, `kind`, `demoType`, `title`, `mode`
- `proofId`, `verifyUrl`, `publicProofUrl` (always for batch; per-row for transaction)
- `proofMeta.taskType`, `proofMeta.taskInputHash`, `proofMeta.taskOutputHash` (batch)
- `dataSummary.kind`, `dataSummary.rows|entries`, `dataSummary.sha256Hex`
- `batchSummary` (batch + also returned for transaction)
- `transactionResults[]` (transaction)
- `enterprise.pricing`, `enterprise.roi`

---

## 7) Pricing Tiers (for d11 finalization)

These are the current positioning strings returned by the demos:

- **Exchange:** Starting at **$15,000–$25,000/month**
- **AI Marketplace:** Starting at **$10,000–$15,000/month**
- **Gaming:** Starting at **$15,000–$20,000/month**
- **Banking:** Starting at **$20,000–$25,000/month**

Recommended packaging alignment (to finalize in `d11`):

- **SMB / pay-per-use:** `mode=transaction` (per-row proofs, bounded)
- **Enterprise:** `mode=batch` (single proof + `batchSummary`, SLA/audit-friendly)

---

## 8) Validation Checklist (sales / SE)

- [ ] Landing page loads for each vertical
- [ ] Template download works for each vertical
- [ ] `mode=batch` produces `batchSummary`
- [ ] `mode=transaction` produces `transactionResults[]` (<= 25)
- [ ] `verifyUrl` is accessible and shows the proof
- [ ] `publicProofUrl` responds
- [ ] Deterministic hashing: same file → same `dataSummary.sha256Hex`
- [ ] Messaging alignment: “crypto-only”, no off-product references

---

## 9) Security Note

- Never paste `PHOENIX_ZERO_DEMO_RUN_TOKEN` into docs or public channels.
- Rotate the token if it was exposed in logs.
