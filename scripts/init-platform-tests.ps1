param(
  [string]$RootDir = "",
  [switch]$IncludeExtended
)

$ErrorActionPreference = 'Stop'

try { chcp 65001 | Out-Null } catch {}
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

if ([string]::IsNullOrWhiteSpace($RootDir)) {
  $RootDir = Join-Path $Root 'platform-tests'
}

$platforms = @('whatsapp','instagram','tiktok','youtube','linkedin')
if ($IncludeExtended) {
  $platforms = @('whatsapp','instagram','tiktok','youtube','linkedin','twitter','telegram','discord','slack','facebook')
}

function Ensure-Dirs {
  param([string[]]$Paths)
  foreach ($p in $Paths) {
    New-Item -ItemType Directory -Force -Path $p | Out-Null
  }
}

$videoRoot = $RootDir
$imageRoot = Join-Path $RootDir 'image'
$audioRoot = Join-Path $RootDir 'audio'
$liveRoot = Join-Path $RootDir 'live'

Ensure-Dirs @(
  $videoRoot,
  (Join-Path $videoRoot 'downloads'),
  (Join-Path $videoRoot 'output'),
  (Join-Path $videoRoot 'proofs'),
  (Join-Path $videoRoot 'reports'),
  (Join-Path $videoRoot 'robustness'),
  $imageRoot,
  (Join-Path $imageRoot 'downloads'),
  (Join-Path $imageRoot 'output'),
  (Join-Path $imageRoot 'proofs'),
  (Join-Path $imageRoot 'reports'),
  $audioRoot,
  (Join-Path $audioRoot 'downloads'),
  (Join-Path $audioRoot 'output'),
  (Join-Path $audioRoot 'proofs'),
  (Join-Path $audioRoot 'reports'),
  $liveRoot,
  (Join-Path $liveRoot 'downloads'),
  (Join-Path $liveRoot 'output'),
  (Join-Path $liveRoot 'proofs'),
  (Join-Path $liveRoot 'reports'),
  (Join-Path $RootDir 'demo-assets'),
  (Join-Path (Join-Path $RootDir 'demo-assets') 'v1'),
  (Join-Path (Join-Path $RootDir 'demo-assets') 'v2')
)

foreach ($p in $platforms) {
  Ensure-Dirs @(
    (Join-Path (Join-Path $videoRoot 'downloads') $p),
    (Join-Path (Join-Path $imageRoot 'downloads') $p),
    (Join-Path (Join-Path $audioRoot 'downloads') $p),
    (Join-Path (Join-Path $liveRoot 'downloads') $p)
  )
}

Write-Host "OK: estrutura criada/garantida em: $RootDir"
Write-Host "Plataformas: $($platforms -join ', ')"
Write-Host "Video: $videoRoot"
Write-Host "Image: $imageRoot"
Write-Host "Audio: $audioRoot"
Write-Host "Live:  $liveRoot"
