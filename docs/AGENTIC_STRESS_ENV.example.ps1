$ErrorActionPreference = 'Stop'

# Phoenix Zero base URL
$env:PHOENIX_ZERO_BASE_URL = 'http://localhost:3000'

# Required for admin endpoints (tenant creation, advance/revert, slashing/escrow admin ops)
$env:PHOENIX_ZERO_ADMIN_TOKEN = 'REPLACE_ME'

# If the backend requires webhook auth for PIX, set this in BOTH:
# - the terminal where you run `npm run dev:web`
# - the terminal where you run the stress test
$env:ASAAS_WEBHOOK_SECRET = 'REPLACE_ME'

# Only required to run L3 (PIX webhook forgery + replay/idempotency) using Asaas API
$env:ASAAS_API_KEY = 'REPLACE_ME'

# Optional: enable real-mode flows (wait for real provider, etc.)
$env:AGENTIC_STRESS_REAL = '0'
$env:AGENTIC_STRESS_REAL_PROVIDER = 'pix'
$env:AGENTIC_STRESS_WAIT_SECONDS = '900'
