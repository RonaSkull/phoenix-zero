param(
  [string]$BaseUrl = 'http://localhost:3000',
  [string]$EnvFile = '',
  [ValidateSet('deterministic','real:pix','real:crypto')]
  [string]$Mode = 'deterministic',
  [int]$WaitSeconds = 60,
  [switch]$LeaveServerRunning
)

$ErrorActionPreference = 'Stop'

function Test-ServerUp([string]$Url) {
  try {
    $resp = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec 3 -UseBasicParsing
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
$BaseUrl = $BaseUrl.TrimEnd('/')

$env:PHOENIX_ZERO_BASE_URL = $BaseUrl

if ($EnvFile -and (Test-Path -LiteralPath $EnvFile)) {
  . $EnvFile
}

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
  Require-Env -Name 'PAYMENTS_PIX_PROVIDER' -Hint "Set it to 'asaas' in your env file."
  Require-Env -Name 'ASAAS_API_KEY' -Hint 'Required to create Asaas PIX charge.'
  if ($env:PAYMENTS_PIX_PROVIDER.Trim().ToLowerInvariant() -ne 'asaas') {
    throw "PAYMENTS_PIX_PROVIDER must be 'asaas' for real PIX mode. Current value is not 'asaas'."
  }
}

if ($Mode -eq 'real:crypto') {
  Require-Env -Name 'PAYMENTS_CRYPTO_PROVIDER' -Hint "Set it to 'nowpayments' in your env file."
  Require-Env -Name 'NOWPAYMENTS_API_KEY' -Hint 'Required to create NowPayments invoice.'
  if ($env:PAYMENTS_CRYPTO_PROVIDER.Trim().ToLowerInvariant() -ne 'nowpayments') {
    throw "PAYMENTS_CRYPTO_PROVIDER must be 'nowpayments' for real crypto mode. Current value is not 'nowpayments'."
  }
}

$startedServer = $false
$devProc = $null

if (-not (Test-ServerUp -Url $BaseUrl)) {
  $devProc = Start-Process -FilePath 'npm' -ArgumentList @('run','dev:web') -WorkingDirectory $RepoRoot -PassThru -NoNewWindow
  $startedServer = $true

  $deadline = (Get-Date).AddSeconds($WaitSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-ServerUp -Url $BaseUrl) {
      break
    }
    Start-Sleep -Milliseconds 500
  }

  if (-not (Test-ServerUp -Url $BaseUrl)) {
    if ($startedServer -and $devProc) {
      Stop-ProcessTree -ProcessId $devProc.Id
    }
    throw "Server did not become ready at $BaseUrl within ${WaitSeconds}s."
  }
}

Push-Location $RepoRoot
try {
  if ($Mode -eq 'deterministic') {
    & npm run test:agentic
  } elseif ($Mode -eq 'real:pix') {
    $env:AGENTIC_STRESS_REAL = '1'
    $env:AGENTIC_STRESS_REAL_PROVIDER = 'pix'
    & npm run test:agentic
  } elseif ($Mode -eq 'real:crypto') {
    $env:AGENTIC_STRESS_REAL = '1'
    $env:AGENTIC_STRESS_REAL_PROVIDER = 'crypto'
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
