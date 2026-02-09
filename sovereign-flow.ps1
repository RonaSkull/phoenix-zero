$ErrorActionPreference = "Stop"

$BASE = "https://phoenix-zero-web.onrender.com"
$ADMIN_TOKEN = $env:PHOENIX_ZERO_ADMIN_TOKEN

if (-not $ADMIN_TOKEN) {
  throw "Missing env PHOENIX_ZERO_ADMIN_TOKEN. Set: `$env:PHOENIX_ZERO_ADMIN_TOKEN = '...'"
}

function Invoke-Json {
  param(
    [Parameter(Mandatory=$true)][string]$Method,
    [Parameter(Mandatory=$true)][string]$Url,
    [Parameter(Mandatory=$true)][hashtable]$Headers,
    $BodyObj
  )

  try {
    if ($null -ne $BodyObj) {
      return Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers -ContentType "application/json" -Body ($BodyObj | ConvertTo-Json -Depth 30)
    }

    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers
  } catch {
    Write-Host "HTTP call failed: $Method $Url" -ForegroundColor Red

    if ($_.Exception.Response) {
      try {
        $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $respBody = $sr.ReadToEnd()
        if ($respBody) {
          Write-Host "Response body:" -ForegroundColor Yellow
          Write-Host $respBody
        }
      } catch {
      }
    }

    throw
  }
}

# 1) Admin creates sovereign tenant
$tenantName = "Sovereign Demo " + (Get-Date).ToString("yyyyMMdd-HHmmss")

$createTenantBody = @{
  name = $tenantName
  clientType = "sovereign"
  sector = "fintech"
  country = "BR"
  currency = "USD"
  pricingProfile = "default"
  commissionProfile = "default"
  taxProfile = "default"
  sessionTtlSeconds = 604800
  next = "/enterprise-demo"
}

$tenantRes = Invoke-Json -Method "POST" -Url "$BASE/api/admin/tenants" -Headers @{ "x-admin-token" = $ADMIN_TOKEN } -BodyObj $createTenantBody
if (-not $tenantRes.ok) { throw ("admin/tenants failed: " + ($tenantRes | ConvertTo-Json -Depth 30)) }

$TENANT_ID = $tenantRes.tenant.tenantId
$API_KEY = $tenantRes.apiKey

Write-Host "Tenant created:"
Write-Host ("  tenantId: " + $TENANT_ID)
Write-Host ("  apiKey:   " + $API_KEY)

# 2) Pricing
$pricing = Invoke-Json -Method "GET" -Url "$BASE/api/pricing" -Headers @{ "x-api-key" = $API_KEY; "Cache-Control"="no-store" } -BodyObj $null
Write-Host ("Pricing sovereign.enabled = " + $pricing.sovereign.enabled)

# 3) Checkout/create (PPE lineItem + sovereign proofMeta.taskType)
$agentId  = "enterprise-agent-001"
$taskId   = "recon-" + (Get-Date).ToString("yyyyMMdd-HHmmss")
$taskType = "reconcile_psp"

$inputEvidence  = @{ batchId = $taskId; kind = "psp_reconciliation"; rows = 1200; currency = "USD" } | ConvertTo-Json -Compress -Depth 20
$outputEvidence = @{ batchId = $taskId; kind = "psp_reconciliation_result"; matched = 1198; breaks = 2 } | ConvertTo-Json -Compress -Depth 20

$inHash  = "sha256:" + (Get-FileHash -InputStream ([IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes($inputEvidence)))  -Algorithm SHA256).Hash.ToLower()
$outHash = "sha256:" + (Get-FileHash -InputStream ([IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes($outputEvidence))) -Algorithm SHA256).Hash.ToLower()

$checkoutBody = @{
  currency = "USD"
  providerHint = "crypto"
  lineItems = @(
    @{ operation = "protect_report"; product = "protect_report"; units = 1 }
  )
  proofMeta = @{
    agentId = $agentId
    taskId = $taskId
    taskType = $taskType
    taskInputHash = $inHash
    taskOutputHash = $outHash
  }
}

$checkout = Invoke-Json -Method "POST" -Url "$BASE/api/checkout/create" -Headers @{ "x-api-key" = $API_KEY } -BodyObj $checkoutBody
if (-not $checkout.ok) { throw ("checkout/create failed: " + ($checkout | ConvertTo-Json -Depth 30)) }

$paymentId = [string]$checkout.paymentId
if (-not $paymentId) {
  throw ("checkout/create did not return paymentId: " + ($checkout | ConvertTo-Json -Depth 30))
}
Write-Host ("paymentId = " + $paymentId)

# 4) Admin fallback-paid
$fallback = Invoke-Json -Method "POST" -Url "$BASE/api/admin/fallback-paid" -Headers @{ "x-admin-token" = $ADMIN_TOKEN } -BodyObj @{ paymentId = $paymentId }
if (-not $fallback.ok) { throw ("admin/fallback-paid failed: " + ($fallback | ConvertTo-Json -Depth 30)) }

$proofId = $fallback.proofId
Write-Host ("proofId = " + $proofId)

# 5) Fetch proof JSON
$proof = Invoke-Json -Method "GET" -Url "$BASE/api/payment-proofs/$proofId" -Headers @{ "x-api-key" = $API_KEY; "Cache-Control"="no-store" } -BodyObj $null
Write-Host ("proof.id = " + $proof.id)
Write-Host ("proofMeta.taskType = " + $proof.proofMeta.taskType)
Write-Host ("verifyUrl = " + "$BASE/verify/$proofId")

Start-Process "$BASE/verify/$proofId"
