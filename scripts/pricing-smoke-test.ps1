param(
  [string]$Base = "",
  [string]$AdminToken = $env:PHOENIX_ZERO_ADMIN_TOKEN
)

$ErrorActionPreference = 'Stop'

function Test-BaseUrl([string]$u) {
  try {
    $r = Invoke-WebRequest -Uri ("$u/api/compatibility") -UseBasicParsing -TimeoutSec 2
    return $r.StatusCode -ge 200 -and $r.StatusCode -lt 500
  } catch {
    return $false
  }
}

if ([string]::IsNullOrWhiteSpace($Base)) {
  $candidates = @(
    'http://localhost:3001',
    'http://localhost:3000',
    'http://localhost:3002'
  )
  foreach ($c in $candidates) {
    if (Test-BaseUrl $c) { $Base = $c; break }
  }
}

if ([string]::IsNullOrWhiteSpace($Base)) {
  throw "Nenhum servidor respondeu em 3001/3000/3002. Suba o server (dev:web ou start:web) e rode de novo."
}

Write-Host "Base: $Base"

$adminHeaders = @{}
if (-not [string]::IsNullOrWhiteSpace($AdminToken)) {
  $adminHeaders = @{ 'x-admin-token' = $AdminToken }
} else {
  Write-Host "Aviso: PHOENIX_ZERO_ADMIN_TOKEN não está setado. Endpoints admin vão falhar (401/500)." 
}

function PostJson([string]$path, [object]$obj, [hashtable]$headers) {
  $json = $obj | ConvertTo-Json -Depth 10 -Compress
  return Invoke-RestMethod -Method Post -Uri ("$Base$path") -Headers $headers -ContentType 'application/json' -Body $json
}

function GetJson([string]$path, [hashtable]$headers) {
  return Invoke-RestMethod -Method Get -Uri ("$Base$path") -Headers $headers
}

Write-Host "[1/4] Provisioning pricing profile p1";
try {
  $p1 = PostJson '/api/admin/pricing-profiles' (@{
    id = 'p1'
    currency = 'USD'
    basePriceCentsByOp = @{ verify_by_url = 150; share_link_create = 50 }
    multiplierByClientType = @{ unknown = 1; business = 1.2; individual = 1 }
    multiplierBySector = @{ unknown = 1 }
    multiplierByCountry = @{ unknown = 1; br = 1.1 }
  }) $adminHeaders
} catch {
  throw ("Falha ao criar pricing profile. Se estiver em PROD, confira PHOENIX_ZERO_ADMIN_TOKEN. Erro: " + $_.Exception.Message)
}

Write-Host "[2/4] Creating tenant using pricingProfile=p1";
try {
  $tenantRes = PostJson '/api/admin/tenants' (@{
    name = "Tenant Pricing Smoke $(Get-Date -Format 'yyyyMMdd-HHmmss')"
    pricingProfile = 'p1'
    commissionProfile = 'default'
    taxProfile = 'default'
  }) $adminHeaders
} catch {
  throw ("Falha ao criar tenant. Se estiver em PROD, confira PHOENIX_ZERO_ADMIN_TOKEN. Erro: " + $_.Exception.Message)
}

if (-not $tenantRes.ok) {
  throw ("Failed to create tenant: " + ($tenantRes | ConvertTo-Json -Depth 20))
}

$apiKey = $tenantRes.apiKey
if ([string]::IsNullOrWhiteSpace($apiKey)) {
  throw ("Tenant created but apiKey missing. Response: " + ($tenantRes | ConvertTo-Json -Depth 20))
}

Write-Host "TenantId: $($tenantRes.tenant.tenantId)"
Write-Host "Tenant API Key: $apiKey"

Write-Host "[3/4] Running quotes";
$quotes = @(
  @{ operation = 'verify_by_url'; clientType = 'business'; country = 'br'; currency = 'USD' },
  @{ operation = 'verify_by_url'; clientType = 'individual'; country = 'unknown'; currency = 'USD' },
  @{ operation = 'share_link_create'; clientType = 'business'; country = 'br'; currency = 'USD' }
)

foreach ($q in $quotes) {
  try {
    $res = Invoke-RestMethod -Method Post -Uri ("$Base/api/pricing/quote") -Headers @{ 'x-api-key' = $apiKey } -ContentType 'application/json' -Body ($q | ConvertTo-Json -Depth 10 -Compress)
    $fp = if ($res.ok) { [math]::Round(([double]$res.finalPriceCents) / 100.0, 2) } else { $null }
    Write-Host ("- op={0} clientType={1} country={2} => ok={3} final={4} {5}" -f $q.operation, $q.clientType, $q.country, $res.ok, $fp, $res.currency)
  } catch {
    throw ("Falha no quote (tenant). Erro: " + $_.Exception.Message)
  }
}

Write-Host "[4/4] UI for manual exploration: $Base/pricing-lab";
Write-Host "Cole a Tenant API Key acima no campo x-api-key e clique em 'Calcular preco'.";
