#!/usr/bin/env bash
set -euo pipefail

BASE="${PHOENIX_ZERO_BASE_URL:-https://phoenix-zero-web.onrender.com}"
TENANT_API_KEY="${PHOENIX_ZERO_TENANT_API_KEY:-}"

AGENT_ID="agent://curl-example"
TASK_ID="task_curl_001"
TASK_TYPE="protect_video"

echo "[1] Discover"
curl -s "$BASE/.well-known/ai-service.json" | head -c 1200
printf "\n\n"

echo "[2] Pricing"
curl -s "$BASE/api/pricing" | head -c 1200
printf "\n\n"

echo "[3] Compatibility"
curl -s -X POST "$BASE/api/compatibility" \
  -H "Content-Type: application/json" \
  -d '{"operation":"protect_video","intent":"execute","client":"agent"}'
printf "\n\n"

if [ -z "$TENANT_API_KEY" ]; then
  echo "[4] Checkout/Execute skipped (PHOENIX_ZERO_TENANT_API_KEY not set)"
  exit 0
fi

echo "[4] Create checkout (requires tenant api key)"
curl -s -X POST "$BASE/api/checkout/create" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $TENANT_API_KEY" \
  -d '{
    "providerHint":"pix",
    "currency":"BRL",
    "lineItems":[{
      "operation":"protect_video",
      "product":"video_protection",
      "units":1,
      "country":"BR",
      "clientType":"system",
      "sector":"system"
    }],
    "proofMeta":{
      "agentId":"'"$AGENT_ID"'",
      "taskId":"'"$TASK_ID"'",
      "taskType":"'"$TASK_TYPE"'"
    }
  }'
printf "\n\n"

echo "[5] Execute (expected 403 before payment)"
curl -s -X POST "$BASE/api/agents/$(printf '%s' "$AGENT_ID" | sed 's#agent://##')/execute" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $TENANT_API_KEY" \
  -d '{"taskId":"'"$TASK_ID"'","taskType":"'"$TASK_TYPE"'"}'
printf "\n"
