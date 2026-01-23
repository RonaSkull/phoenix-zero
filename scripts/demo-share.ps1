param(
  [int]$Port = 3000,
  [switch]$StartDev,
  [switch]$Open,
  [switch]$NoLan,
  [int]$WaitSeconds = 45
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

function Get-RepoRoot {
  $here = $null
  try {
    if ($PSScriptRoot) { $here = $PSScriptRoot }
  } catch {
  }

  try {
    if (-not $here -and $PSCommandPath) { $here = Split-Path -Parent $PSCommandPath }
  } catch {
  }

  if (-not $here) {
    # Fallback: assume you ran the script from repo root
    return (Get-Location).Path
  }

  return (Resolve-Path (Join-Path $here '..')).Path
}

function Get-LanIPv4 {
  if ($NoLan) { return @() }
  $ips = @()
  try {
    $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object {
        $_.IPAddress -and
        $_.IPAddress -ne '127.0.0.1' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.PrefixOrigin -ne 'WellKnown'
      } |
      Select-Object -ExpandProperty IPAddress
  } catch {
    $ips = @()
  }
  return ($ips | Select-Object -Unique)
}

function Test-HttpReady {
  param(
    [Parameter(Mandatory = $true)][string]$BaseUrl
  )

  try {
    $res = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri ($BaseUrl.TrimEnd('/') + '/api/live-stream')
    return $res.StatusCode -ge 200 -and $res.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Find-RunningBaseUrl {
  param(
    [int]$PreferredPort = 3000,
    [int]$MaxPort = 3010
  )

  $ports = @($PreferredPort)
  foreach ($p in ($PreferredPort..$MaxPort)) {
    if ($p -ne $PreferredPort) { $ports += $p }
  }

  foreach ($p in $ports) {
    $base = "http://localhost:${p}"
    if (Test-HttpReady -BaseUrl $base) {
      return $base
    }
  }

  return $null
}

function Show-PortHint {
  param([int]$Port)

  try {
    $conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 3
    if ($conn) {
      Write-Host "Port $Port appears to be in use." -ForegroundColor Yellow
      foreach ($c in $conn) {
        Write-Host ("- {0}:{1} {2} pid={3}" -f $c.LocalAddress, $c.LocalPort, $c.State, $c.OwningProcess) -ForegroundColor Yellow
      }
    }
  } catch {
  }
}

function Wait-HttpReady {
  param(
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [int]$Seconds = 45
  )

  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-HttpReady -BaseUrl $BaseUrl) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Start-DevServer {
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot
  )

  $cmd = 'npm run dev:web'
  Write-Host "Starting dev server: $cmd" -ForegroundColor Cyan

  Start-Process -FilePath 'powershell.exe' -WorkingDirectory $RepoRoot -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-Command', $cmd
  ) | Out-Null
}

$repoRoot = Get-RepoRoot
$preferredBase = "http://localhost:${Port}"

if ($StartDev) {
  Start-DevServer -RepoRoot $repoRoot
}

Write-Host ''
Write-Host "Waiting for server (preferred: $preferredBase) ..." -ForegroundColor Cyan

$found = $null
$deadline = (Get-Date).AddSeconds($WaitSeconds)
while ((Get-Date) -lt $deadline) {
  $found = Find-RunningBaseUrl -PreferredPort $Port -MaxPort 3010
  if ($found) { break }
  Start-Sleep -Milliseconds 600
}

if (-not $found) {
  Show-PortHint -Port $Port
  Write-Host "Server not reachable yet. If it's starting, wait a bit and re-run." -ForegroundColor Yellow
  Write-Host "Tip: run manually: npm run dev:web" -ForegroundColor Yellow
  exit 1
}

$localBase = $found

$lanIps = Get-LanIPv4

$links = @(
  '/creator',
  '/creator/panel',
  '/live-stream',
  '/demo',
  '/image-demo',
  '/image-demo-wm',
  '/live-embed-demo'
)

Write-Host ''
Write-Host 'Phoenix Zero demo links:' -ForegroundColor Green
Write-Host "- Local: $localBase" -ForegroundColor Green
foreach ($p in $links) {
  Write-Host "  $($localBase.TrimEnd('/') + $p)" -ForegroundColor Gray
}

if ($lanIps.Count -gt 0) {
  Write-Host ''
  Write-Host 'LAN (same Wi-Fi) links:' -ForegroundColor Green
  foreach ($ip in $lanIps) {
    $base = "http://${ip}:${Port}"
    Write-Host "- $base" -ForegroundColor Green
    foreach ($p in $links) {
      Write-Host "  $($base.TrimEnd('/') + $p)" -ForegroundColor Gray
    }
  }
  Write-Host ''
  Write-Host 'Note: if access from another device fails, check Windows Firewall rules for Node/port 3000.' -ForegroundColor Yellow
}

if ($Open) {
  Start-Process ($localBase.TrimEnd('/') + '/creator') | Out-Null
}
