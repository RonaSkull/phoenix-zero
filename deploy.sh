#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: ${name}" >&2
    exit 1
  fi
}

optional_env_hint() {
  local name="$1"
  local hint="$2"
  if [[ -z "${!name:-}" ]]; then
    echo "WARN: ${name} is not set. ${hint}" >&2
  fi
}

PORT="${PORT:-3000}"
NODE_ENV="${NODE_ENV:-production}"

export NODE_ENV

echo "Phoenix Zero deploy"
echo "- ROOT_DIR=${ROOT_DIR}"
echo "- NODE_ENV=${NODE_ENV}"
echo "- PORT=${PORT}"

require_env PHOENIX_ZERO_ADMIN_TOKEN
require_env PHOENIX_ZERO_PRIVATE_KEY_B64URL

optional_env_hint PHOENIX_ZERO_PUBLIC_BASE_URL "Set this in production so the system generates correct public links."
optional_env_hint PHOENIX_ZERO_PUBLIC_API_KEY "Optional: used by public/global endpoints that internally call guarded endpoints (ex.: /api/global-live-auth -> /api/live-stream)."

optional_env_hint PHOENIX_ZERO_TMP_DIR "Recommended in production (persistent volume) to avoid losing billing/payment state on restart."

# Payments (optional, but recommended for production)
if [[ "${PAYMENTS_PIX_PROVIDER:-}" == "asaas" ]]; then
  require_env ASAAS_API_KEY
  require_env ASAAS_WEBHOOK_SECRET
fi

if [[ "${PAYMENTS_CRYPTO_PROVIDER:-}" == "nowpayments" ]]; then
  require_env NOWPAYMENTS_API_KEY
  require_env NOWPAYMENTS_IPN_SECRET
fi

cd "${ROOT_DIR}"

echo "Installing dependencies (root)…"
npm ci

echo "Installing dependencies (apps/web)…"
npm --prefix ./apps/web ci

echo "Building…"
npm run build

echo "Starting server…"
exec npm run start:web -- -p "${PORT}" -H 0.0.0.0
