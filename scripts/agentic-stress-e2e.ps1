param(
  [string]$BaseUrl = 'http://localhost:3000',
  [string]$EnvFile = '',
  [string]$OnlyLevels = '',
  [ValidateSet('deterministic','real:pix','real:crypto')]
  [string]$Mode = 'deterministic',
  [int]$WaitSeconds = 60,
  [switch]$LeaveServerRunning
)

$ErrorActionPreference = 'Stop'

function Test-ServerUp([string]$Url, [int]$TimeoutSec = 3) {
  $healthUrl = ($Url.TrimEnd('/') + '/api/health')
  try {
    $resp = Invoke-WebRequest -Uri $healthUrl -Method GET -TimeoutSec $TimeoutSec -UseBasicParsing
    return $resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Stop-ProcessTree([int]$ProcessId) {
  try {
    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" | Select-Object -ExpandProperty ProcessId
    foreach ($childPid in $children) {
      Stop-ProcessTree -ProcessId $childPid
    }
  } catch {
  }

  try {
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  } catch {
  }
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')

function Import-DotEnvFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $lines = Get-Content -LiteralPath $Path -ErrorAction Stop
  foreach ($line in $lines) {
    $s = [string]$line
    if ([string]::IsNullOrWhiteSpace($s)) { continue }
    $t = $s.Trim()
    if ($t.StartsWith('#')) { continue }
    $idx = $t.IndexOf('=')
    if ($idx -lt 1) { continue }
    $k = $t.Substring(0, $idx).Trim()
    $v = $t.Substring($idx + 1)
    if ([string]::IsNullOrWhiteSpace($k)) { continue }
    $v = [string]$v
    $v = $v.Trim()
    if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
      if ($v.Length -ge 2) { $v = $v.Substring(1, $v.Length - 2) }
    }
    Set-Item -Path ("env:" + $k) -Value $v
  }
}

function Import-EnvFile([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return }
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
  if ($ext -eq '.ps1') {
    . $Path
    return
  }
  Import-DotEnvFile -Path $Path
}

if ([string]::IsNullOrWhiteSpace($BaseUrl) -or $BaseUrl -eq 'http://localhost:3000') {
  if (-not [string]::IsNullOrWhiteSpace($env:PHOENIX_ZERO_BASE_URL)) {
    $BaseUrl = $env:PHOENIX_ZERO_BASE_URL
  }
}

$BaseUrl = $BaseUrl.TrimEnd('/')

$env:PHOENIX_ZERO_BASE_URL = $BaseUrl

function Test-IsRemoteBaseUrl([string]$Url) {
  $u = [string]$Url
  if ([string]::IsNullOrWhiteSpace($u)) { return $false }
  $u = $u.Trim()
  if ($u -notmatch '^https?://') { return $false }
  $u = $u.TrimEnd('/')
  return -not ($u -match '^https?://(localhost|127\.0\.0\.1|\[::1\])([:/]|$)')
}

if ($EnvFile) {
  Import-EnvFile -Path $EnvFile
} else {
  $defaultLocal = (Join-Path $RepoRoot '.env.local')
  if (Test-Path -LiteralPath $defaultLocal) {
    Import-DotEnvFile -Path $defaultLocal
  }
}

$isRemote = Test-IsRemoteBaseUrl -Url $BaseUrl

function Test-HasEnv([string]$Name) {
  $v = [string]($ExecutionContext.SessionState.PSVariable.GetValue("env:$Name") )
  return -not [string]::IsNullOrWhiteSpace($v)
}

function Require-Env([string]$Name, [string]$Hint) {
  if (-not (Test-HasEnv -Name $Name)) {
    throw "Missing required env var '$Name'. $Hint"
  }
}

if ($Mode -eq 'real:pix') {
  if (-not $isRemote) {
    Require-Env -Name 'PAYMENTS_PIX_PROVIDER' -Hint "Set it to 'asaas' in your env file."
    Require-Env -Name 'ASAAS_API_KEY' -Hint 'Required to create Asaas PIX charge.'
    if ($env:PAYMENTS_PIX_PROVIDER.Trim().ToLowerInvariant() -ne 'asaas') {
      throw "PAYMENTS_PIX_PROVIDER must be 'asaas' for real PIX mode. Current value is not 'asaas'."
    }
  }
}

if ($Mode -eq 'real:crypto') {
  if (-not $isRemote) {
    Require-Env -Name 'PAYMENTS_CRYPTO_PROVIDER' -Hint "Set it to 'nowpayments' in your env file."
    Require-Env -Name 'NOWPAYMENTS_API_KEY' -Hint 'Required to create NowPayments invoice.'
    if ($env:PAYMENTS_CRYPTO_PROVIDER.Trim().ToLowerInvariant() -ne 'nowpayments') {
      throw "PAYMENTS_CRYPTO_PROVIDER must be 'nowpayments' for real crypto mode. Current value is not 'nowpayments'."
    }
  }
}

$startedServer = $false
$devProc = $null

$healthTimeout = if ($isRemote) { 15 } else { 3 }

if ($isRemote) {
  $deadline = (Get-Date).AddSeconds($WaitSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-ServerUp -Url $BaseUrl -TimeoutSec $healthTimeout) {
      break
    }
    Start-Sleep -Milliseconds 1000
  }

  if (-not (Test-ServerUp -Url $BaseUrl -TimeoutSec $healthTimeout)) {
    throw "Remote server did not become ready at $BaseUrl within ${WaitSeconds}s. (Render may be spun down; increase -WaitSeconds)"
  }
} elseif (-not (Test-ServerUp -Url $BaseUrl -TimeoutSec $healthTimeout)) {
  $devProc = Start-Process -FilePath 'npm' -ArgumentList @('run','dev:web') -WorkingDirectory $RepoRoot -PassThru -NoNewWindow
  $startedServer = $true

  $deadline = (Get-Date).AddSeconds($WaitSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-ServerUp -Url $BaseUrl -TimeoutSec $healthTimeout) {
      break
    }
    Start-Sleep -Milliseconds 500
  }

  if (-not (Test-ServerUp -Url $BaseUrl -TimeoutSec $healthTimeout)) {
    if ($startedServer -and $devProc) {
      Stop-ProcessTree -ProcessId $devProc.Id
    }
    throw "Server did not become ready at $BaseUrl within ${WaitSeconds}s."
  }
}

Push-Location $RepoRoot
try {
  if (-not [string]::IsNullOrWhiteSpace($OnlyLevels)) {
    $env:AGENTIC_STRESS_ONLY = $OnlyLevels
  }
  if ($Mode -eq 'deterministic') {
    & npm run test:agentic
  } elseif ($Mode -eq 'real:pix') {
    $env:AGENTIC_STRESS_REAL = '1'
    $env:AGENTIC_STRESS_REAL_PROVIDER = 'pix'
    if (-not [string]::IsNullOrWhiteSpace($OnlyLevels)) {
    } else {
      $env:AGENTIC_STRESS_ONLY = 'L5,L11'
    }
    & npm run test:agentic
  } elseif ($Mode -eq 'real:crypto') {
    $env:AGENTIC_STRESS_REAL = '1'
    $env:AGENTIC_STRESS_REAL_PROVIDER = 'crypto'
    if (-not [string]::IsNullOrWhiteSpace($OnlyLevels)) {
    } else {
      $env:AGENTIC_STRESS_ONLY = 'L5,L11'
    }
    & npm run test:agentic
  } else {
    throw "Unknown mode: $Mode"
  }
} finally {
  Pop-Location
  if (-not $LeaveServerRunning) {
    if ($startedServer -and $devProc) {
      Stop-ProcessTree -ProcessId $devProc.Id
    }
  }
}
