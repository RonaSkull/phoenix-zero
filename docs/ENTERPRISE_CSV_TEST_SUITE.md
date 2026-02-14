# Enterprise CSV Test Suite — Phoenix Zero Sovereign Demos

> **Document Version:** 1.0  
> **Last Updated:** 2026-02-14  
> **Status:** Production Ready

---

## 🎯 Overview

This document defines the enterprise-grade CSV test suite for Phoenix Zero Sovereign vertical demos. These templates replace basic "toy" examples with real-world data structures that enterprise financial teams expect.

This suite supports a **hybrid demo mode**:

- **`transaction`**: generates **one proof per row** (small volumes). Limited for safety.
- **`batch`**: generates **one proof per file** + `batchSummary` (enterprise volumes).
- **`auto`**: chooses `transaction` for small files and `batch` for large files.

---

## 📊 Enterprise CSV Templates

### 1. Crypto Exchange Settlement (`exchange_settlement_template.csv`)

**Purpose:** Real-world settlement batches used by exchanges (Binance/Coinbase/Kraken) and institutional ops teams.

**Schema (21 fields):**
| Field | Type | Description |
|-------|------|-------------|
| `settlement_batch_id` | string | Batch identifier for hourly/daily settlement windows |
| `transaction_id` | string | Internal settlement transaction identifier |
| `blockchain` | enum | Chain/network (BTC, ETH, TRON, SOL, etc.) |
| `asset` | string | Asset symbol (BTC, ETH, USDC, USDT) |
| `amount` | decimal | Settlement amount in `asset` units |
| `fee_usd` | decimal | Fee amount expressed in USD (maker/taker + internal) |
| `gas_fee_native` | decimal | Network fee in native units (e.g., ETH, BTC) |
| `tx_hash` | hash | On-chain transaction hash |
| `block_number` | integer | Block number for finality tracking |
| `block_timestamp` | ISO8601 | On-chain timestamp (UTC) |
| `counterparty_wallet` | address | Counterparty wallet/address |
| `counterparty_name` | string | Counterparty label (e.g., Prime broker / venue / internal desk) |
| `kyc_status` | enum | VERIFIED/PENDING/FAILED |
| `risk_rating` | enum | LOW/MEDIUM/HIGH |
| `settlement_window` | string | Settlement window (T+0, T+1, etc.) |
| `fx_rate_usd` | decimal | USD conversion reference rate at settlement time |
| `order_id` | string | Internal order / trade matching ID |
| `trade_type` | enum | buy/sell/transfer |
| `regulatory_code` | string | Reporting/compliance code (e.g., Travel Rule) |
| `audit_trail_id` | string | Internal audit trail reference |
| `settlement_status` | enum | pending/settled/failed |

**Sample Row:**
```csv
batch_20260214_001,tx_8f72a1b9,ETH,USDC,50000.00,12.50,0.00250000,0xabc123...,18456789,2026-02-14T15:30:00Z,0x742d35...,Binance_KYC_Pass,VERIFIED,LOW,T+0,1.0000,ord_9f8e7d6c,buy,FATF_TR_001,audit_crypto_001,settled
```

**Business Value:**
- **On-chain verification** via `tx_hash` + `block_number`
- **Batch reconciliation** via `settlement_batch_id` (enterprise operations reality)
- **Cost attribution** via `fee_usd` + `gas_fee_native`
- **Compliance readiness** via `kyc_status`, `risk_rating`, `regulatory_code`, `audit_trail_id`

---

### 2. AI Marketplace Agent Transactions (`ai_marketplace_template.csv`)

**Purpose:** LangChain/AutoGPT marketplace execution records

**Schema (11 fields):**
| Field | Type | Description |
|-------|------|-------------|
| `execution_id` | string | Unique execution identifier |
| `agent_id` | string | Agent identifier |
| `task_type` | string | Task classification |
| `compute_units` | integer | Resource consumption |
| `memory_gb` | integer | Memory allocation |
| `hours_executed` | decimal | Execution duration |
| `cost_usd` | decimal | Billing amount |
| `payment_status` | enum | completed/pending/failed |
| `proof_id` | string | Phoenix Zero proof reference |
| `parent_task_id` | string | Workflow parent reference |
| `resource_pool` | string | Infrastructure pool |

**Sample Row:**
```csv
exec_a1b2c3d4,agent_langchain_001,data_analysis,150,8,2.5,75.00,completed,ppo_xyz123,parent_001,gpu_pool_a
```

**Business Value:**
- Resource billing via `compute_units` × `hours_executed`
- Capacity planning via `resource_pool`
- Workflow tracing via `parent_task_id`
- Payment verification via `proof_id`

---

### 3. Gaming Tournament Payouts (`gaming_tournament_template.csv`)

**Purpose:** Twitch/Discord esports tournament payout records

**Schema (11 fields):**
| Field | Type | Description |
|-------|------|-------------|
| `payout_id` | string | Unique payout identifier |
| `player_id` | string | Player identifier |
| `player_wallet` | address | Crypto wallet for payout |
| `tournament_id` | string | Tournament reference |
| `placement` | integer | Ranking position |
| `prize_amount_usd` | decimal | Gross prize amount |
| `token_type` | string | Payout token (USDC, USDT) |
| `payout_status` | enum | completed/pending/failed |
| `verification_proof` | string | Phoenix Zero proof ID |
| `platform_fee_usd` | decimal | Platform commission |
| `net_payout_usd` | decimal | Player net amount |

**Sample Row:**
```csv
pay_1a2b3c4d,player_twitch_xxx,0x123456...,tourn_2026_001,1,50000.00,USDC,completed,ppo_gaming_001,2500.00,47500.00
```

**Business Value:**
- Crypto payouts via `player_wallet`
- Revenue sharing via `platform_fee_usd`
- Tax reporting via `net_payout_usd`
- Event tracking via `tournament_id`

---

### 4. Banking Reconciliation (`banking_reconciliation_template.csv`)

**Purpose:** Digital bank BC/Febraban compliance records

**Schema (12 fields):**
| Field | Type | Description |
|-------|------|-------------|
| `reconciliation_id` | string | Unique reconciliation ID |
| `account_id` | string | Account identifier |
| `transaction_date` | ISO8601 | Transaction timestamp |
| `transaction_type` | string | Transaction classification |
| `amount_usd` | decimal | USD equivalent amount |
| `currency_pair` | string | FX pair (USDC_BRL) |
| `exchange_rate` | decimal | Applied FX rate |
| `counterparty_name` | string | Counterparty entity |
| `reference_number` | string | Internal reference |
| `reconciliation_status` | enum | reconciled/pending/exception |
| `compliance_check` | enum | passed/failed/pending |
| `audit_trail_id` | string | BC audit reference |

**Sample Row:**
```csv
rec_1a2b3c4d,acct_nubank_001,2026-02-14T10:00:00Z,crypto_settlement,250000.00,USDC_BRL,5.25,Nubank Treasury,ref_001,reconciled,passed,audit_001
```

**Business Value:**
- FX reconciliation via `currency_pair` + `exchange_rate`
- Valuation accuracy via `amount_usd`
- Regulatory compliance via `compliance_check`
- BC/Febraban audit via `audit_trail_id`

---

## 🧪 Test Execution Guide

### Modes

Send the `mode` field in the multipart request:

- `mode=auto` (default)
- `mode=batch`
- `mode=transaction`

**Safety limits (current demo defaults):**

- `transaction` mode executes up to **25** rows.
- `batchSummary` aggregates up to **5000** rows to keep CPU bounded on huge files.

### Quick Test via cURL

```powershell
# 1. Exchange Settlement Test
$base = "https://phoenix-zero-web.onrender.com"
curl.exe -X POST "$base/api/demo/run-with-data" `
  -H "x-demo-run-token: $env:PHOENIX_ZERO_DEMO_RUN_TOKEN" `
  -F "demoType=exchange" `
  -F "mode=batch" `
  -F "file=@exchange_settlement_template.csv"

# 2. AI Marketplace Test
curl.exe -X POST "$base/api/demo/run-with-data" `
  -H "x-demo-run-token: $env:PHOENIX_ZERO_DEMO_RUN_TOKEN" `
  -F "demoType=ai-marketplace" `
  -F "mode=auto" `
  -F "file=@ai_marketplace_enterprise.csv"

# 3. Gaming Tournament Test
curl.exe -X POST "$base/api/demo/run-with-data" `
  -H "x-demo-run-token: $env:PHOENIX_ZERO_DEMO_RUN_TOKEN" `
  -F "demoType=gaming" `
  -F "mode=transaction" `
  -F "file=@gaming_enterprise.csv"

# 4. Banking Reconciliation Test
curl.exe -X POST "$base/api/demo/run-with-data" `
  -H "x-demo-run-token: $env:PHOENIX_ZERO_DEMO_RUN_TOKEN" `
  -F "demoType=banking" `
  -F "mode=batch" `
  -F "file=@banking_enterprise.csv"
```

### Expected Response Structure

```json
{
  "success": true,
  "kind": "real_business_data_demo",
  "demoType": "exchange",
  "title": "Crypto Exchange Settlement Proof",
  "mode": "batch",
  "paymentId": "pay_...",
  "proofId": "ppo_xxxxxxxx",
  "verifyUrl": "https://phoenix-zero-web.onrender.com/verify/ppo_xxxxxxxx",
  "publicProofUrl": "https://phoenix-zero-web.onrender.com/api/guarantee-proofs/ppo_xxxxxxxx",
  "timestamp": "2026-02-14T12:34:56.789Z",
  "proofMeta": {
    "taskType": "reconcile_psp",
    "taskInputHash": "sha256:...",
    "taskOutputHash": "sha256:..."
  },
  "dataSummary": {
    "kind": "csv",
    "rows": 15000,
    "sha256Hex": "..."
  },
  "batchSummary": {
    "rowCount": 15000,
    "sumNotionalUsd": 2500000.0,
    "distinctAssets": ["USDC", "USDT"],
    "highRiskCount": 3,
    "failedCount": 12,
    "batchId": "settlement_20260214_T+0",
    "settlementWindow": "T+0"
  },
  "transactionResults": [
    {
      "rowIndex": 1,
      "paymentId": "pay_...",
      "proofId": "ppo_...",
      "verifyUrl": "https://phoenix-zero-web.onrender.com/verify/ppo_..."
    }
  ]
}
```

---

## 📈 Enterprise Value Metrics

| Vertical | Before Phoenix Zero | After Phoenix Zero | Savings |
|----------|---------------------|-------------------|---------|
| **Exchange** | 72h manual reconciliation | 2 min automated | $320K/year |
| **AI Marketplace** | Hourly billing disputes | Real-time proof | 90% reduction |
| **Gaming** | Trust-based payouts | Cryptographic proof | Zero disputes |
| **Banking** | 3-day BC compliance | Instant audit-ready | 90% cost reduction |

---

## 🚀 Landing Page URLs

Test directly in browser:

- **Exchange:** `https://phoenix-zero-web.onrender.com/for-exchanges`
- **AI Marketplace:** `https://phoenix-zero-web.onrender.com/for-ai-marketplaces`
- **Gaming:** `https://phoenix-zero-web.onrender.com/for-gaming`
- **Banking:** `https://phoenix-zero-web.onrender.com/for-banking`

---

## ✅ Validation Checklist

- [ ] All 4 CSV templates download successfully from `/templates/*.csv`
- [ ] Upload via landing page UI generates proof within 60 seconds
- [ ] Verify URL displays correct data summary
- [ ] Data hashes are deterministic (same CSV = same hashes)
- [ ] Row counts match between upload and summary
- [ ] Total amounts calculate correctly
- [ ] All verticals return `success: true` response

---

## 🔒 Security Notes

- CSV files are processed server-side with size limits (10MB max)
- Data is hashed deterministically (SHA-256) — original data is not stored
- Proof URLs are public but unguessable (UUID-based)
- No sensitive data (private keys, passwords) in templates

---

## 📞 Support

For enterprise demo support:
- Technical: `docs/pay-per-execution/38demos.md`
- Issues: GitHub Issues
- Contact: `/contact` on production site
