param(
  [Parameter(Mandatory = $false)]
  [string]$BaseUrl = "http://localhost:3000",

  [Parameter(Mandatory = $false)]
  [string]$ApiKey = "",

  [Parameter(Mandatory = $false)]
  [string]$ContentCommit = "",

  [Parameter(Mandatory = $false)]
  [string]$File = "",

  [Parameter(Mandatory = $false)]
  [switch]$Sample,

  [Parameter(Mandatory = $false)]
  [ValidateSet('live','vod')]
  [string]$Kind = "live",

  [Parameter(Mandatory = $false)]
  [ValidateSet('compat','strict')]
  [string]$Mode = "compat",

  [Parameter(Mandatory = $false)]
  [int]$TtlSeconds = 30,

  [Parameter(Mandatory = $false)]
  [switch]$Open
)

$ProgressPreference = "SilentlyContinue"

function Get-TestApiKey {
  param([string]$Base)

  if ($ApiKey -and $ApiKey.Trim()) {
    return $ApiKey.Trim()
  }

  if ($env:PHOENIX_ZERO_TEST_API_KEY -and $env:PHOENIX_ZERO_TEST_API_KEY.Trim()) {
    return $env:PHOENIX_ZERO_TEST_API_KEY.Trim()
  }

  $hdr = @{}
  $admin = ($env:PHOENIX_ZERO_ADMIN_TOKEN + '').Trim()
  if ($admin) { $hdr['x-admin-token'] = $admin }

  $payload = @{ name = "anchor-smoke-$([Guid]::NewGuid().ToString('n').Substring(0, 8))" } | ConvertTo-Json
  $resp = Invoke-WebRequest -Method Post -Uri ("$Base/api/admin/tenants") -ContentType 'application/json' -Body $payload -Headers $hdr
  $json = $null
  try { $json = $resp.Content | ConvertFrom-Json } catch { $json = $null }
  if ($json -and $json.ok -and $json.apiKey) {
    return [string]$json.apiKey
  }

  throw 'Failed to provision test tenant apiKey via /api/admin/tenants'
}

function To-Base64Url {
  param([byte[]]$Bytes)
  $b64 = [Convert]::ToBase64String($Bytes)
  return ($b64 -replace '\+', '-' -replace '/', '_' -replace '=+$', '')
}

function Compute-ContentCommitB64UrlFromFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path $Path)) {
    throw "File not found: $Path"
  }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $fs = [System.IO.File]::OpenRead($Path)
    try {
      $hash = $sha.ComputeHash($fs)
      return (To-Base64Url -Bytes $hash)
    } finally {
      $fs.Close()
    }
  } finally {
    $sha.Dispose()
  }
}

if (-not $ContentCommit -or -not $ContentCommit.Trim()) {
  $resolvedFile = $File
  if ($Sample) {
    $resolvedFile = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")) "out\\video3s.mp4"
  }
  if (-not $resolvedFile -or -not $resolvedFile.Trim()) {
    throw "Missing ContentCommit. Provide -ContentCommit <b64url> or -File <path> or -Sample."
  }
  $ContentCommit = Compute-ContentCommitB64UrlFromFile -Path $resolvedFile
}

if ($TtlSeconds -lt 5) {
  throw "TtlSeconds too small ($TtlSeconds). Use 5+ to observe VALID -> EXPIRED." 
}

$baseUri = [uri]$BaseUrl
$basePort = if ($baseUri.IsDefaultPort) {
  if ($baseUri.Scheme -eq "https") { 443 } else { 80 }
} else {
  $baseUri.Port
}

$connOk = Test-NetConnection $baseUri.Host -Port $basePort -InformationLevel Quiet
if (-not $connOk) {
  throw "Server not reachable at $BaseUrl (host=$($baseUri.Host) port=$basePort). Start it with: npm run dev:web"
}

$apiKey = Get-TestApiKey -Base $BaseUrl
$authHeaders = @{ 'x-api-key' = $apiKey }

try {
  Invoke-RestMethod -Method Get -Uri ("$BaseUrl/api/time-anchor?anchorId=_warmup_") -Headers $authHeaders -ErrorAction Stop | Out-Null
} catch {
}

try {
  Invoke-RestMethod -Method Get -Uri ("$BaseUrl/api/public-anchor/_warmup_?contentCommit=_warmup_") -ErrorAction Stop | Out-Null
} catch {
}

$createBody = @{ action = 'create'; kind = $Kind; contentCommitB64Url = $ContentCommit; ttlSeconds = $TtlSeconds; mode = $Mode } | ConvertTo-Json

try {
  $create = Invoke-RestMethod -Method Post -Uri ("$BaseUrl/api/time-anchor") -ContentType "application/json" -Body $createBody -Headers $authHeaders -ErrorAction Stop
} catch {
  "CREATE_HTTP_ERROR: $($_.Exception.Message)"
  if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream()) {
    $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    "CREATE_HTTP_ERROR_BODY: $($sr.ReadToEnd())"
  }
  throw "Create failed"
}

if (-not $create.ok) { throw "Create failed" }

$anchorId = $create.anchorId
$verifyUrlWithCommit = $create.verifyUrlWithCommit
$verifyUrlOfficial = $create.verifyUrlOfficial
$verificationToken = $create.verificationToken

"CREATE_OK: $($create.ok)"

"ANCHOR_ID: $anchorId"
"VERIFY_URL_WITH_COMMIT: $verifyUrlWithCommit"
if ($verifyUrlOfficial) { "VERIFY_URL_OFFICIAL: $verifyUrlOfficial" }
if ($verificationToken) { "VERIFICATION_TOKEN: $verificationToken" }

if ($Open) {
  if ($verifyUrlOfficial) {
    Start-Process $verifyUrlOfficial
  } else {
    Start-Process $verifyUrlWithCommit
  }
}

$encodedAnchorId = [uri]::EscapeDataString($anchorId)
$encodedCommit = [uri]::EscapeDataString($ContentCommit)

$encodedToken = if ($verificationToken) { [uri]::EscapeDataString([string]$verificationToken) } else { '' }

$verifyNowUrl = $BaseUrl + "/api/public-anchor/" + $encodedAnchorId + "?contentCommit=" + $encodedCommit
"VERIFY_NOW_URL: $verifyNowUrl"

$verifyNowUrlOfficial = if ($encodedToken) { $BaseUrl + "/api/public-anchor/" + $encodedAnchorId + "?v=" + $encodedToken } else { '' }
if ($verifyNowUrlOfficial) { "VERIFY_NOW_URL_OFFICIAL: $verifyNowUrlOfficial" }

$internalGetUrl = $BaseUrl + "/api/time-anchor?anchorId=" + $encodedAnchorId + "&contentCommit=" + $encodedCommit
"INTERNAL_GET_URL: $internalGetUrl"

try {
  $internalGet = Invoke-RestMethod -Method Get -Uri $internalGetUrl -Headers $authHeaders -ErrorAction Stop
  "INTERNAL_GET_OK: $($internalGet.ok)"
} catch {
  "INTERNAL_GET_ERROR: $($_.Exception.Message)"
  if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream()) {
    $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    "INTERNAL_GET_ERROR_BODY: $($sr.ReadToEnd())"
  }
}

try {
  $verifyNow = Invoke-RestMethod -Method Get -Uri $verifyNowUrl -ErrorAction Stop
} catch {
  "VERIFY_NOW_ERROR: $($_.Exception.Message)"
  if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream()) {
    $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    "VERIFY_NOW_ERROR_BODY: $($sr.ReadToEnd())"
  }
  throw
}

"VERIFY_NOW_OK: $($verifyNow.ok)"
"VERIFY_NOW_WINDOW: $($verifyNow.verified.window)"
"VERIFY_NOW_VERIFIED_OK: $($verifyNow.verified.ok)"
"VERIFY_NOW_COINCIDENCE: $($verifyNow.verified.coincidence)"
"VERIFY_NOW_CONFIDENCE: $($verifyNow.verified.confidence)"

if ($verifyNowUrlOfficial) {
  try {
    $verifyNowOfficial = Invoke-RestMethod -Method Get -Uri $verifyNowUrlOfficial -ErrorAction Stop
    "VERIFY_OFFICIAL_OK: $($verifyNowOfficial.ok)"
    "VERIFY_OFFICIAL_WINDOW: $($verifyNowOfficial.verified.window)"
    "VERIFY_OFFICIAL_VERIFIED_OK: $($verifyNowOfficial.verified.ok)"
    "VERIFY_OFFICIAL_COINCIDENCE: $($verifyNowOfficial.verified.coincidence)"
    "VERIFY_OFFICIAL_CONFIDENCE: $($verifyNowOfficial.verified.confidence)"
  } catch {
    "VERIFY_OFFICIAL_ERROR: $($_.Exception.Message)"
    if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream()) {
      $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      "VERIFY_OFFICIAL_ERROR_BODY: $($sr.ReadToEnd())"
    }
    throw
  }
}

$waitSeconds = [Math]::Max(1, $TtlSeconds + 2)
Start-Sleep -Seconds $waitSeconds

try {
  $verifyLater = Invoke-RestMethod -Method Get -Uri $verifyNowUrl -ErrorAction Stop
} catch {
  "VERIFY_LATER_ERROR: $($_.Exception.Message)"
  if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream()) {
    $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    "VERIFY_LATER_ERROR_BODY: $($sr.ReadToEnd())"
  }
  throw
}

"VERIFY_LATER_OK: $($verifyLater.ok)"
"VERIFY_LATER_WINDOW: $($verifyLater.verified.window)"
"VERIFY_LATER_VERIFIED_OK: $($verifyLater.verified.ok)"
"VERIFY_LATER_COINCIDENCE: $($verifyLater.verified.coincidence)"
"VERIFY_LATER_CONFIDENCE: $($verifyLater.verified.confidence)"
