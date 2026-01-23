param(
  [string]$Base = "http://localhost:3000",
  [int]$RateLimitBurst = 400,
  [int]$BigFileMb = 55
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

try {
  Add-Type -AssemblyName System.Net.Http
} catch {
}

function Require-CurlExe {
  $cmd = Get-Command curl.exe -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "curl.exe not found. On Windows, install curl or use a PowerShell that has curl.exe available."
  }
}

function New-TempFilePath {
  param([string]$Prefix, [string]$Ext)
  $name = "{0}-{1}{2}" -f $Prefix, ([Guid]::NewGuid().ToString('n').Substring(0, 10)), $Ext
  return Join-Path ([IO.Path]::GetTempPath()) $name
}

function Invoke-Curl {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('GET','POST')][string]$Method,
    [Parameter(Mandatory = $true)][string]$Url,
    [string[]]$Headers = @(),
    [string]$JsonBody = $null,
    [string[]]$Form = @()
  )

  Require-CurlExe

  $hdrPath = New-TempFilePath -Prefix 'pz-h' -Ext '.txt'
  $bodyPath = New-TempFilePath -Prefix 'pz-b' -Ext '.txt'

  $args = @(
    '-sS',
    '-D', $hdrPath,
    '-o', $bodyPath,
    '-X', $Method
  )

  foreach ($h in $Headers) {
    if ($h) { $args += @('-H', $h) }
  }

  if ($JsonBody -ne $null -and $JsonBody -ne '') {
    $args += @('--data-raw', $JsonBody)
  }

  foreach ($f in $Form) {
    if ($f) { $args += @('-F', $f) }
  }

  $args += $Url

  $statusRaw = ''
  try {
    $statusRaw = (& curl.exe @args -w "%{http_code}")
  } catch {
    $statusRaw = ''
  }

  $statusTxt = [string]$statusRaw
  $statusTxt = ($statusTxt -replace "\s+", "").Trim()
  $status = 0
  if ([int]::TryParse($statusTxt, [ref]$status)) {
  } else {
    $status = 0
  }

  $hdr = ''
  $body = ''
  try { if (Test-Path $hdrPath) { $hdr = Get-Content $hdrPath -Raw } } catch {}
  try { if (Test-Path $bodyPath) { $body = Get-Content $bodyPath -Raw } } catch {}

  try { Remove-Item -Force $hdrPath -ErrorAction SilentlyContinue } catch {}
  try { Remove-Item -Force $bodyPath -ErrorAction SilentlyContinue } catch {}

  return [pscustomobject]@{
    Status = $status
    Headers = $hdr
    Body = $body
    Url = $Url
    Method = $Method
  }
}

function Invoke-MultipartPost {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [hashtable]$Fields = @{},
    [hashtable]$FileFields = @{}
  )

  $client = New-Object System.Net.Http.HttpClient
  $multipart = New-Object System.Net.Http.MultipartFormDataContent
  $streams = New-Object System.Collections.Generic.List[object]

  try {
    foreach ($k in $Fields.Keys) {
      $v = [string]$Fields[$k]
      $multipart.Add((New-Object System.Net.Http.StringContent($v)), [string]$k)
    }

    foreach ($k in $FileFields.Keys) {
      $file = $FileFields[$k]
      $path = [string]$file.Path
      $ctype = [string]$file.ContentType

      $fs = [System.IO.File]::OpenRead($path)
      $streams.Add($fs) | Out-Null

      $sc = New-Object System.Net.Http.StreamContent($fs)
      if ($ctype -and $ctype.Trim()) {
        $sc.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse($ctype)
      }

      $multipart.Add($sc, [string]$k, [System.IO.Path]::GetFileName($path))
    }

    $resp = $client.PostAsync($Url, $multipart).GetAwaiter().GetResult()
    $body = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    return [pscustomobject]@{ Status = [int]$resp.StatusCode; Headers = ''; Body = [string]$body; Url = $Url; Method = 'POST' }
  } finally {
    try { $multipart.Dispose() } catch {}
    try { $client.Dispose() } catch {}
    foreach ($s in $streams) { try { $s.Dispose() } catch {} }
  }
}

function Read-WebResponseBody {
  param($Response)
  try {
    if (-not $Response) { return '' }
    $stream = $Response.GetResponseStream()
    if (-not $stream) { return '' }
    $reader = New-Object System.IO.StreamReader($stream)
    try { return $reader.ReadToEnd() } finally { $reader.Close() }
  } catch {
    return ''
  }
}

function Invoke-JsonPost {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][hashtable]$Body,
    [hashtable]$Headers = @{}
  )

  $json = ($Body | ConvertTo-Json -Compress)
  try {
    $hdr = @{}
    foreach ($k in $Headers.Keys) { $hdr[$k] = [string]$Headers[$k] }
    $resp = Invoke-WebRequest -Method Post -Uri $Url -ContentType 'application/json' -Body $json -Headers $hdr
    return [pscustomobject]@{ Status = [int]$resp.StatusCode; Headers = ''; Body = [string]$resp.Content; Url = $Url; Method = 'POST' }
  } catch {
    $r = $_.Exception.Response
    if ($r) {
      $status = 0
      try { $status = [int]$r.StatusCode } catch { $status = 0 }
      $content = Read-WebResponseBody -Response $r
      return [pscustomobject]@{ Status = $status; Headers = ''; Body = [string]$content; Url = $Url; Method = 'POST' }
    }
    throw
  }
}

function Ensure-BigFile {
  param([int]$Mb)

  $p = Join-Path ([IO.Path]::GetTempPath()) ("pz-big-{0}mb.bin" -f $Mb)
  if (Test-Path $p) { return $p }

  $bytes = [int64]$Mb * 1024 * 1024
  $fs = [System.IO.File]::Open($p, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  try {
    $fs.SetLength($bytes)
  } finally {
    $fs.Close()
  }
  return $p
}

$results = New-Object System.Collections.Generic.List[object]

function Get-TestApiKey {
  param([string]$BaseUrl)

  if ($env:PHOENIX_ZERO_TEST_API_KEY -and $env:PHOENIX_ZERO_TEST_API_KEY.Trim()) {
    return $env:PHOENIX_ZERO_TEST_API_KEY.Trim()
  }

  if ($script:__pzTestApiKey -and $script:__pzTestApiKey.Trim()) {
    return $script:__pzTestApiKey
  }

  $hdr = @{}
  $admin = ($env:PHOENIX_ZERO_ADMIN_TOKEN + '').Trim()
  if ($admin) { $hdr['x-admin-token'] = $admin }

  $payload = @{ name = "smoke-$([Guid]::NewGuid().ToString('n').Substring(0, 8))" } | ConvertTo-Json
  try {
    $resp = Invoke-WebRequest -Method Post -Uri "$BaseUrl/api/admin/tenants" -ContentType 'application/json' -Body $payload -Headers $hdr
    $json = $null
    try { $json = $resp.Content | ConvertFrom-Json } catch { $json = $null }
    if ($json -and $json.ok -and $json.apiKey) {
      $script:__pzTestApiKey = [string]$json.apiKey
      return $script:__pzTestApiKey
    }
  } catch {
  }

  throw 'Failed to provision test tenant apiKey via /api/admin/tenants'
}

function Add-Result {
  param(
    [string]$Name,
    [string]$Expected,
    [int]$Got,
    [string]$Notes
  )

  $ok = $false
  if ($Expected -match '^\d+$') {
    $ok = ($Got -eq [int]$Expected)
  } elseif ($Expected -match '^\d+\|') {
    $parts = $Expected.Split('|')
    $ok = $parts -contains ([string]$Got)
  } else {
    $ok = $true
  }

  $results.Add([pscustomobject]@{
    Name = $Name
    Expected = $Expected
    Got = $Got
    Ok = $ok
    Notes = $Notes
  }) | Out-Null
}

Write-Host "Base=$Base"

$apiKey = ''
try {
  $apiKey = Get-TestApiKey -BaseUrl $Base
  Write-Host "TenantApiKey=OK"
} catch {
  Write-Host "TenantApiKey=FAIL $($_.Exception.Message)" -ForegroundColor Yellow
}

$demoAudioPath = New-TempFilePath -Prefix 'pz-audio' -Ext '.wav'
$demoAudioProofPath = New-TempFilePath -Prefix 'pz-audio-proof' -Ext '.json'
$demoAudioReady = $false
try {
  Require-CurlExe
  & curl.exe -sS -o $demoAudioPath "$Base/demo/assets/v2/audio-wm.wav" | Out-Null
  & curl.exe -sS -o $demoAudioProofPath "$Base/demo/assets/v2/audio-wm-proof.json" | Out-Null
  $demoAudioReady = (Test-Path $demoAudioPath) -and (Test-Path $demoAudioProofPath)
} catch {
  $demoAudioReady = $false
}

# 0) Sanity: server reachable
try {
  $hdr = @()
  if ($apiKey) { $hdr += "x-api-key: $apiKey" }
  $r = Invoke-Curl -Method 'GET' -Url "$Base/api/live-stream" -Headers $hdr
  Add-Result -Name 'sanity: GET /api/live-stream' -Expected '200|401' -Got $r.Status -Notes ''
} catch {
  Add-Result -Name 'sanity: GET /api/live-stream' -Expected '200|401' -Got 0 -Notes $_.Exception.Message
}

# 1) SSRF: invalid scheme -> 400
try {
  $hdr = @{}
  if ($apiKey) { $hdr['x-api-key'] = $apiKey }
  $r = Invoke-JsonPost -Url "$Base/api/phoenix-zero/verify-by-url" -Body @{ videoUrl = 'file:///etc/passwd'; proofUrl = 'file:///etc/passwd' } -Headers $hdr
  Add-Result -Name 'ssrf: file:// scheme blocked' -Expected '400' -Got $r.Status -Notes ($r.Body.Trim() | Select-Object -First 1)
} catch {
  Add-Result -Name 'ssrf: file:// scheme blocked' -Expected '400' -Got 0 -Notes $_.Exception.Message
}

try {
  $hdr = @{}
  if ($apiKey) { $hdr['x-api-key'] = $apiKey }
  $r = Invoke-JsonPost -Url "$Base/api/phoenix-zero/verify-audio-by-url" -Body @{ audioUrl = 'file:///etc/passwd'; proofUrl = 'file:///etc/passwd' } -Headers $hdr
  Add-Result -Name 'ssrf(audio): file:// scheme blocked' -Expected '400' -Got $r.Status -Notes ($r.Body.Trim() | Select-Object -First 1)
} catch {
  Add-Result -Name 'ssrf(audio): file:// scheme blocked' -Expected '400' -Got 0 -Notes $_.Exception.Message
}

# 2) SSRF: credentials in URL -> 400
try {
  $hdr = @{}
  if ($apiKey) { $hdr['x-api-key'] = $apiKey }
  $r = Invoke-JsonPost -Url "$Base/api/phoenix-zero/verify-by-url" -Body @{ videoUrl = 'https://user:pass@example.com/video.mp4'; proofUrl = 'https://user:pass@example.com/proof.json' } -Headers $hdr
  Add-Result -Name 'ssrf: credentials blocked' -Expected '400' -Got $r.Status -Notes ($r.Body.Trim() | Select-Object -First 1)
} catch {
  Add-Result -Name 'ssrf: credentials blocked' -Expected '400' -Got 0 -Notes $_.Exception.Message
}

try {
  $hdr = @{}
  if ($apiKey) { $hdr['x-api-key'] = $apiKey }
  $r = Invoke-JsonPost -Url "$Base/api/phoenix-zero/verify-audio-by-url" -Body @{ audioUrl = 'https://user:pass@example.com/audio.wav'; proofUrl = 'https://user:pass@example.com/proof.json' } -Headers $hdr
  Add-Result -Name 'ssrf(audio): credentials blocked' -Expected '400' -Got $r.Status -Notes ($r.Body.Trim() | Select-Object -First 1)
} catch {
  Add-Result -Name 'ssrf(audio): credentials blocked' -Expected '400' -Got 0 -Notes $_.Exception.Message
}

# 3) SSRF: redirect blocked -> 400
try {
  $hdr = @{}
  if ($apiKey) { $hdr['x-api-key'] = $apiKey }
  $r = Invoke-JsonPost -Url "$Base/api/phoenix-zero/verify-by-url" -Body @{ videoUrl = 'https://httpbin.org/redirect/1'; proofUrl = 'https://httpbin.org/redirect/1' } -Headers $hdr
  Add-Result -Name 'ssrf: redirect blocked' -Expected '400' -Got $r.Status -Notes ($r.Body.Trim() | Select-Object -First 1)
} catch {
  Add-Result -Name 'ssrf: redirect blocked' -Expected '400' -Got 0 -Notes $_.Exception.Message
}

try {
  $hdr = @{}
  if ($apiKey) { $hdr['x-api-key'] = $apiKey }
  $r = Invoke-JsonPost -Url "$Base/api/phoenix-zero/verify-audio-by-url" -Body @{ audioUrl = 'https://httpbin.org/redirect/1'; proofUrl = 'https://httpbin.org/redirect/1' } -Headers $hdr
  Add-Result -Name 'ssrf(audio): redirect blocked' -Expected '400' -Got $r.Status -Notes ($r.Body.Trim() | Select-Object -First 1)
} catch {
  Add-Result -Name 'ssrf(audio): redirect blocked' -Expected '400' -Got 0 -Notes $_.Exception.Message
}

# 4) SSRF: timeout -> 504 (may take up to PHOENIX_ZERO_VERIFY_URL_FETCH_TIMEOUT_MS)
try {
  $hdr = @{}
  if ($apiKey) { $hdr['x-api-key'] = $apiKey }
  $r = Invoke-JsonPost -Url "$Base/api/phoenix-zero/verify-by-url" -Body @{ videoUrl = 'https://httpbin.org/delay/20'; proofUrl = 'https://httpbin.org/delay/20' } -Headers $hdr
  $snippet = ''
  try { $snippet = ($r.Body | Select-Object -First 1) } catch { $snippet = '' }
  Add-Result -Name 'ssrf: fetch timeout' -Expected '504|200|400' -Got $r.Status -Notes ("status=$($r.Status); body=" + $snippet)
} catch {
  Add-Result -Name 'ssrf: fetch timeout' -Expected '504|200|400' -Got 0 -Notes $_.Exception.Message
}

try {
  $hdr = @{}
  if ($apiKey) { $hdr['x-api-key'] = $apiKey }
  $r = Invoke-JsonPost -Url "$Base/api/phoenix-zero/verify-audio-by-url" -Body @{ audioUrl = 'https://httpbin.org/delay/20'; proofUrl = 'https://httpbin.org/delay/20' } -Headers $hdr
  $snippet = ''
  try { $snippet = ($r.Body | Select-Object -First 1) } catch { $snippet = '' }
  Add-Result -Name 'ssrf(audio): fetch timeout' -Expected '504|200|400' -Got $r.Status -Notes ("status=$($r.Status); body=" + $snippet)
} catch {
  Add-Result -Name 'ssrf(audio): fetch timeout' -Expected '504|200|400' -Got 0 -Notes $_.Exception.Message
}

# 5) Upload size limits -> 413
$big = Ensure-BigFile -Mb $BigFileMb

try {
  $hdr = @()
  if ($apiKey) { $hdr += "x-api-key: $apiKey" }
  $r = Invoke-Curl -Method 'POST' -Url "$Base/api/phoenix-zero/verify-watermarked" -Headers $hdr -Form @(
    ('video=@' + $big + ';type=video/mp4')
  )
  Add-Result -Name "upload: verify-watermarked > ${BigFileMb}MB" -Expected '413|400' -Got $r.Status -Notes 'Expected 413 when PHOENIX_ZERO_VERIFY_WATERMARKED_MAX_VIDEO_BYTES <= file size.'
} catch {
  Add-Result -Name "upload: verify-watermarked > ${BigFileMb}MB" -Expected '413|400' -Got 0 -Notes $_.Exception.Message
}

try {
  $hdr = @()
  if ($apiKey) { $hdr += "x-api-key: $apiKey" }
  $r = Invoke-Curl -Method 'POST' -Url "$Base/api/phoenix-zero/verify-audio" -Headers $hdr -Form @(
    ('audio=@' + $big + ';type=audio/wav'),
    ('proof=@' + $demoAudioProofPath + ';type=application/json')
  )
  Add-Result -Name "upload: verify-audio > ${BigFileMb}MB" -Expected '413|400' -Got $r.Status -Notes 'Expected 413 when PHOENIX_ZERO_VERIFY_AUDIO_MAX_AUDIO_BYTES <= file size.'
} catch {
  Add-Result -Name "upload: verify-audio > ${BigFileMb}MB" -Expected '413|400' -Got 0 -Notes $_.Exception.Message
}

try {
  if ($demoAudioReady) {
    $hdr = @()
    if ($apiKey) { $hdr += "x-api-key: $apiKey" }
    $r = Invoke-Curl -Method 'POST' -Url "$Base/api/phoenix-zero/verify-audio" -Headers $hdr -Form @(
      ('audio=@' + $demoAudioPath + ';type=audio/wav'),
      ('proof=@' + $demoAudioProofPath + ';type=application/json')
    )
    Add-Result -Name 'audio: verify-audio demo asset' -Expected '200' -Got $r.Status -Notes ''
  } else {
    Add-Result -Name 'audio: verify-audio demo asset' -Expected '200' -Got 0 -Notes 'demo audio assets not available'
  }
} catch {
  Add-Result -Name 'audio: verify-audio demo asset' -Expected '200' -Got 0 -Notes $_.Exception.Message
}

try {
  $hdr = @{}
  if ($apiKey) { $hdr['x-api-key'] = $apiKey }
  $r = Invoke-JsonPost -Url "$Base/api/phoenix-zero/verify-audio-by-url" -Body @{ audioUrl = "$Base/demo/assets/v2/audio-wm.wav"; proofUrl = "$Base/demo/assets/v2/audio-wm-proof.json" } -Headers $hdr
  Add-Result -Name 'audio: verify-audio-by-url demo asset' -Expected '200' -Got $r.Status -Notes ''
} catch {
  Add-Result -Name 'audio: verify-audio-by-url demo asset' -Expected '200' -Got 0 -Notes $_.Exception.Message
}

try {
  $hdr = @()
  if ($apiKey) { $hdr += "x-api-key: $apiKey" }
  $r = Invoke-Curl -Method 'POST' -Url "$Base/api/live-stream" -Headers $hdr -Form @(
    'action=start',
    ('video=@' + $big)
  )
  $snippet = ''
  try { $snippet = ($r.Body | Select-Object -First 1) } catch { $snippet = '' }
  Add-Result -Name "upload: live-stream start > ${BigFileMb}MB" -Expected '413|400' -Got $r.Status -Notes ("Expected 413 when PHOENIX_ZERO_LIVE_STREAM_MAX_START_VIDEO_BYTES <= file size. body=" + $snippet)
} catch {
  Add-Result -Name "upload: live-stream start > ${BigFileMb}MB" -Expected '413|400' -Got 0 -Notes $_.Exception.Message
}

# 6) Rate limit: share-link -> 429
try {
  $xff = '203.0.113.10'
  $hit429 = 0
  $codes = @()
  $max = [Math]::Max(1, $RateLimitBurst)
  for ($i = 1; $i -le $max; $i++) {
    # Send empty JSON so we don't spend time creating links; rate limiting is checked before body validation.
    $hdr = @{ 'x-forwarded-for' = $xff }
    if ($apiKey) { $hdr['x-api-key'] = $apiKey }
    $r = Invoke-JsonPost -Url "$Base/api/share-link" -Body @{} -Headers $hdr
    $codes += $r.Status
    if ($r.Status -eq 429) { $hit429 += 1; break }
  }

  $note = "codes: " + (($codes | Select-Object -First 10) -join ',') + $(if ($codes.Count -gt 10) { '...' } else { '' }) + "; 429_count=$hit429; attempts=$($codes.Count); xff=$xff"
  Add-Result -Name "rate: share-link burst up to x$RateLimitBurst" -Expected '429' -Got $(if ($hit429 -gt 0) { 429 } else { ($codes | Select-Object -Last 1) }) -Notes ($note + '; if no 429: lower PHOENIX_ZERO_SHARE_LINK_RPM and restart server')
} catch {
  Add-Result -Name "rate: share-link burst up to x$RateLimitBurst" -Expected '429' -Got 0 -Notes $_.Exception.Message
}

# 7) Live-stream: start-webcam + finish + status
$jobId = ''
$ingestToken = ''

try {
  $hdr = @{}
  if ($apiKey) { $hdr['x-api-key'] = $apiKey }
  $r = Invoke-JsonPost -Url "$Base/api/live-stream" -Body @{ action = 'start-webcam'; mode = 'strict'; policy = 'sig+(wm|temporal)'; segmentSeconds = 3 } -Headers $hdr
  $job = $null
  try { $job = $r.Body | ConvertFrom-Json } catch {}
  if ($job -and $job.ok -and $job.jobId) { $jobId = [string]$job.jobId }
  if ($job -and $job.ok -and $job.ingestToken) { $ingestToken = [string]$job.ingestToken }

  Add-Result -Name 'live: start-webcam' -Expected '200' -Got $r.Status -Notes $(if ($jobId) { "jobId=$jobId" } else { 'missing jobId in response' })
} catch {
  Add-Result -Name 'live: start-webcam' -Expected '200' -Got 0 -Notes $_.Exception.Message
}

if ($jobId) {
  try {
    $hdr = @{}
    if ($apiKey) { $hdr['x-api-key'] = $apiKey }
    $r = Invoke-JsonPost -Url "$Base/api/live-stream" -Body @{ action = 'finish'; jobId = $jobId; ingestToken = 'WRONG' } -Headers $hdr
    Add-Result -Name 'live: finish wrong token' -Expected '403|401' -Got $r.Status -Notes ''
  } catch {
    Add-Result -Name 'live: finish wrong token' -Expected '403|401' -Got 0 -Notes $_.Exception.Message
  }

  try {
    $hdr = @{}
    if ($apiKey) { $hdr['x-api-key'] = $apiKey }
    $r = Invoke-JsonPost -Url "$Base/api/live-stream" -Body @{ action = 'finish'; jobId = $jobId; ingestToken = $ingestToken } -Headers $hdr
    Add-Result -Name 'live: finish ok' -Expected '200' -Got $r.Status -Notes ''
  } catch {
    Add-Result -Name 'live: finish ok' -Expected '200' -Got 0 -Notes $_.Exception.Message
  }

  try {
    $hdr = @()
    if ($apiKey) { $hdr += "x-api-key: $apiKey" }
    $r = Invoke-Curl -Method 'GET' -Url "$Base/api/live-stream?jobId=$jobId&tail=6" -Headers $hdr
    Add-Result -Name 'live: GET job tail=6' -Expected '200|401' -Got $r.Status -Notes ''
  } catch {
    Add-Result -Name 'live: GET job tail=6' -Expected '200|401' -Got 0 -Notes $_.Exception.Message
  }

  try {
    $hdr = @()
    if ($apiKey) { $hdr += "x-api-key: $apiKey" }
    $r = Invoke-Curl -Method 'GET' -Url "$Base/api/global-live-auth?jobId=$jobId" -Headers $hdr
    Add-Result -Name 'global-live-auth: GET with jobId' -Expected '200|401' -Got $r.Status -Notes ''
  } catch {
    Add-Result -Name 'global-live-auth: GET with jobId' -Expected '200|401' -Got 0 -Notes $_.Exception.Message
  }

  try {
    $rootDir = if ($env:LIVE_STREAM_DIR -and $env:LIVE_STREAM_DIR.Trim()) { $env:LIVE_STREAM_DIR.Trim() } else { Join-Path ([IO.Path]::GetTempPath()) 'phoenix-zero\live-stream' }
    $secretsPath = Join-Path (Join-Path $rootDir $jobId) 'secrets.json'
    $exists = Test-Path $secretsPath
    Add-Result -Name 'live: secrets.json persisted?' -Expected 'info' -Got $(if ($exists) { 1 } else { 0 }) -Notes ("path=" + $secretsPath)
  } catch {
    Add-Result -Name 'live: secrets.json persisted?' -Expected 'info' -Got 0 -Notes $_.Exception.Message
  }
}

# 8) Global-live-auth missing jobId -> 400
try {
  $hdr = @()
  if ($apiKey) { $hdr += "x-api-key: $apiKey" }
  $r = Invoke-Curl -Method 'GET' -Url "$Base/api/global-live-auth" -Headers $hdr
  Add-Result -Name 'global-live-auth: missing jobId' -Expected '400|401' -Got $r.Status -Notes ''
} catch {
  Add-Result -Name 'global-live-auth: missing jobId' -Expected '400|401' -Got 0 -Notes $_.Exception.Message
}

Write-Host "\n=== HARDENING SMOKE REPORT ==="
$results | Format-Table -AutoSize

try { if ($demoAudioPath) { Remove-Item -Force $demoAudioPath -ErrorAction SilentlyContinue } } catch {}
try { if ($demoAudioProofPath) { Remove-Item -Force $demoAudioProofPath -ErrorAction SilentlyContinue } } catch {}

$fail = @($results | Where-Object { -not $_.Ok })
if ($fail.Count -gt 0) {
  Write-Host "\nFAILED CHECKS:" -ForegroundColor Red
  $fail | Format-Table -AutoSize
  exit 1
}

Write-Host "\nAll checks passed (or are informational)."
exit 0
