param(
  [string]$OriginalAudio = "",
  [string]$CreatorId = "",
  [string]$WorkDir = "",
  [ValidateSet('compat','strict')][string]$Mode = "compat",
  [switch]$ForceStamp,
  [switch]$OnlyAvailable,
  [switch]$IncludeAllPlatforms,
  [switch]$IncludeInstagram,
  [switch]$IncludeTikTok,
  [switch]$IncludeYouTube,
  [switch]$IncludeLinkedIn,
  [switch]$IncludeTwitter
)

$ErrorActionPreference = "Stop"

try { chcp 65001 | Out-Null } catch {}
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
if ([string]::IsNullOrWhiteSpace($WorkDir)) {
  $WorkDir = Join-Path $Root "platform-tests\audio"
}

$ProofDir = Join-Path $WorkDir "proofs"
$DownloadsDir = Join-Path $WorkDir "downloads"
$OutputDir = Join-Path $WorkDir "output"
$ReportsDir = Join-Path $WorkDir "reports"

New-Item -ItemType Directory -Force -Path $ProofDir | Out-Null
New-Item -ItemType Directory -Force -Path $DownloadsDir | Out-Null
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
New-Item -ItemType Directory -Force -Path $ReportsDir | Out-Null

$RunId = (Get-Date).ToString('yyyyMMdd-HHmmss')

$ProofPath = Join-Path $ProofDir "original.proof.json"
$WatermarkedPath = Join-Path $OutputDir "audio.wav"
$WatermarkedOggPath = Join-Path $OutputDir "audio.ogg"

$NeedStamp = $ForceStamp -or !(Test-Path $ProofPath) -or !(Test-Path $WatermarkedPath)

if ($NeedStamp -and [string]::IsNullOrWhiteSpace($env:PHOENIX_ZERO_PRIVATE_KEY_B64URL)) {
  $KeyFile = Join-Path $Root "keys\phoenix-zero-ed25519.json"
  if (Test-Path $KeyFile) {
    $KeyJson = Get-Content $KeyFile -Raw | ConvertFrom-Json
    if ($KeyJson.privateKeyB64Url) {
      $env:PHOENIX_ZERO_PRIVATE_KEY_B64URL = $KeyJson.privateKeyB64Url
    }
  }

  if ([string]::IsNullOrWhiteSpace($env:PHOENIX_ZERO_PRIVATE_KEY_B64URL)) {
    Write-Host "PHOENIX_ZERO_PRIVATE_KEY_B64URL nao encontrado. Gerando chave..."
    npm run keygen | Out-Null

    if (!(Test-Path $KeyFile)) {
      throw "Falha ao gerar chave: arquivo nao encontrado: $KeyFile"
    }

    $KeyJson = Get-Content $KeyFile -Raw | ConvertFrom-Json
    $env:PHOENIX_ZERO_PRIVATE_KEY_B64URL = $KeyJson.privateKeyB64Url
  }
}

if ($NeedStamp -and $Mode -eq 'strict' -and ([string]::IsNullOrWhiteSpace($env:PHOENIX_ZERO_PQ_PRIVATE_KEY_B64URL) -or [string]::IsNullOrWhiteSpace($env:PHOENIX_ZERO_PQ_PUBLIC_KEY_B64URL))) {
  $PqKeyFile = Join-Path $Root "keys\phoenix-zero-sphincs.json"

  if (Test-Path $PqKeyFile) {
    $PqKeyJson = Get-Content $PqKeyFile -Raw | ConvertFrom-Json
    if ($PqKeyJson.privateKeyB64Url -and $PqKeyJson.publicKeyB64Url) {
      $env:PHOENIX_ZERO_PQ_PRIVATE_KEY_B64URL = $PqKeyJson.privateKeyB64Url
      $env:PHOENIX_ZERO_PQ_PUBLIC_KEY_B64URL = $PqKeyJson.publicKeyB64Url
    }
  }

  if ([string]::IsNullOrWhiteSpace($env:PHOENIX_ZERO_PQ_PRIVATE_KEY_B64URL) -or [string]::IsNullOrWhiteSpace($env:PHOENIX_ZERO_PQ_PUBLIC_KEY_B64URL)) {
    Write-Host "Modo strict: chaves PQ nao encontradas. Gerando chave SPHINCS+..."
    npm run pq:keygen | Out-Null

    if (!(Test-Path $PqKeyFile)) {
      throw "Falha ao gerar chave PQ: arquivo nao encontrado: $PqKeyFile"
    }

    $PqKeyJson = Get-Content $PqKeyFile -Raw | ConvertFrom-Json
    $env:PHOENIX_ZERO_PQ_PRIVATE_KEY_B64URL = $PqKeyJson.privateKeyB64Url
    $env:PHOENIX_ZERO_PQ_PUBLIC_KEY_B64URL = $PqKeyJson.publicKeyB64Url
  }
}

if ($NeedStamp) {
  Write-Host "Stamping + embedding AUDIO watermark (mode=$Mode)..."

  $stampArgs = @('--out', "$WatermarkedPath", '--proof', "$ProofPath", '--mode', "$Mode")
  if (-not [string]::IsNullOrWhiteSpace($CreatorId)) { $stampArgs += @('--creatorId', "$CreatorId") }
  if (-not [string]::IsNullOrWhiteSpace($OriginalAudio)) { $stampArgs += @('--in', "$OriginalAudio") }

  npm run stamp:audio:wm -- @stampArgs

  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao gerar watermark/proof (stamp:audio:wm)."
  }

  if (Test-Path $WatermarkedPath) {
    (Get-Item $WatermarkedPath).LastWriteTime = Get-Date
    $wmCopy = Join-Path $OutputDir ("audio-{0}.wav" -f $RunId)
    Copy-Item -LiteralPath $WatermarkedPath -Destination $wmCopy -Force
  }
  if (Test-Path $ProofPath) {
    (Get-Item $ProofPath).LastWriteTime = Get-Date
    $proofCopy = Join-Path $ProofDir ("original.proof-{0}.json" -f $RunId)
    Copy-Item -LiteralPath $ProofPath -Destination $proofCopy -Force
  }
}

if ((Test-Path $WatermarkedPath) -and !(Test-Path $WatermarkedOggPath)) {
  try {
    $ffmpeg = (node -p "require('ffmpeg-static')" 2>$null)
    if (-not [string]::IsNullOrWhiteSpace($ffmpeg) -and (Test-Path $ffmpeg)) {
      & $ffmpeg -hide_banner -y -i "$WatermarkedPath" -c:a libopus -b:a 48k -vbr on -compression_level 10 -application audio "$WatermarkedOggPath" | Out-Null
      if (Test-Path $WatermarkedOggPath) {
        (Get-Item $WatermarkedOggPath).LastWriteTime = Get-Date
        $oggCopy = Join-Path $OutputDir ("audio-{0}.ogg" -f $RunId)
        Copy-Item -LiteralPath $WatermarkedOggPath -Destination $oggCopy -Force
      }
    }
  } catch {
  }
}

$ProofMtime = $null
$WatermarkedMtime = $null
if (Test-Path $ProofPath) { $ProofMtime = (Get-Item $ProofPath).LastWriteTime }
if (Test-Path $WatermarkedPath) { $WatermarkedMtime = (Get-Item $WatermarkedPath).LastWriteTime }

Write-Host ""
Write-Host "Agora faca upload do AUDIO WATERMARKED gerado e depois baixe o audio resultante (re-encoded)."
Write-Host "Arquivo a subir: $WatermarkedPath"
if (Test-Path $WatermarkedOggPath) {
  Write-Host "Alternativa (compat WhatsApp): $WatermarkedOggPath"
}
if ($WatermarkedMtime) { Write-Host ("  (gerado em: {0})" -f $WatermarkedMtime) }
if ($ProofMtime) { Write-Host ("Proof atual: {0} (gerado em: {1})" -f $ProofPath, $ProofMtime) }
Write-Host "Salve os downloads por plataforma assim:" 
Write-Host "  $DownloadsDir\whatsapp\audio.*"
Write-Host "  $DownloadsDir\telegram\audio.*"
Write-Host "  $DownloadsDir\discord\audio.*"
Write-Host "  $DownloadsDir\slack\audio.*"
if ($IncludeAllPlatforms -or $IncludeInstagram) { Write-Host "  $DownloadsDir\instagram\audio.*" }
if ($IncludeAllPlatforms -or $IncludeTikTok) { Write-Host "  $DownloadsDir\tiktok\audio.*" }
if ($IncludeAllPlatforms -or $IncludeYouTube) { Write-Host "  $DownloadsDir\youtube\audio.*" }
if ($IncludeAllPlatforms -or $IncludeLinkedIn) { Write-Host "  $DownloadsDir\linkedin\audio.*" }
if ($IncludeAllPlatforms -or $IncludeTwitter) { Write-Host "  $DownloadsDir\twitter\audio.*" }
Write-Host ""

$Platforms = @('whatsapp','telegram','discord','slack')
if ($IncludeAllPlatforms) {
  $Platforms = @('whatsapp','instagram','tiktok','youtube','linkedin','twitter','telegram','discord','slack')
} else {
  if ($IncludeInstagram) { $Platforms += 'instagram' }
  if ($IncludeTikTok) { $Platforms += 'tiktok' }
  if ($IncludeYouTube) { $Platforms += 'youtube' }
  if ($IncludeLinkedIn) { $Platforms += 'linkedin' }
  if ($IncludeTwitter) { $Platforms += 'twitter' }
}

foreach ($p in $Platforms) {
  $dir = Join-Path $DownloadsDir $p
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

$anyFail = $false
$anyPending = $false

foreach ($p in $Platforms) {
  $dir = Join-Path $DownloadsDir $p

  $candidate = Join-Path $dir 'audio.wav'
  if (!(Test-Path $candidate)) { $candidate = Join-Path $dir 'audio.ogg' }
  if (!(Test-Path $candidate)) { $candidate = Join-Path $dir 'audio.opus' }
  if (!(Test-Path $candidate)) { $candidate = Join-Path $dir 'audio.mp3' }
  if (!(Test-Path $candidate)) { $candidate = Join-Path $dir 'audio.m4a' }
  if (!(Test-Path $candidate)) { $candidate = Join-Path $dir 'audio.aac' }
  if (!(Test-Path $candidate)) { $candidate = Join-Path $dir 'audio.webm' }

  if (!(Test-Path $candidate)) {
    $fallback = Get-ChildItem -Path $dir -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match '\.(wav|mp3|m4a|aac|ogg|opus|webm)$' } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($fallback) { $candidate = $fallback.FullName }
  }

  if (Test-Path $candidate) {
    if ($ProofMtime) {
      $candItem = Get-Item $candidate
      $candTime = $candItem.LastWriteTime
      if ($candItem.CreationTime -gt $candTime) { $candTime = $candItem.CreationTime }

      if ($candTime -lt $ProofMtime) {
        Write-Host ""
        Write-Host "AVISO ${p}: o audio baixado ($candidate) e mais antigo que o proof atual ($ProofPath)."
        Write-Host "Re-baixe e salve novamente em: $dir\audio.*"
        $anyFail = $true
        continue
      }
    }

    Write-Host ""
    Write-Host "Verificando ${p}: $candidate"
    $reportPath = Join-Path $ReportsDir ("{0}-verify-{1}.json" -f $p, $RunId)
    npm run verify:audio:wm -- --in "$candidate" --proof "$ProofPath" | Tee-Object -FilePath $reportPath | Out-Host
    if ($LASTEXITCODE -ne 0) { $anyFail = $true }
  } else {
    Write-Host ""
    if (-not $OnlyAvailable) {
      Write-Host "Pendente ${p}. Coloque o arquivo em: $dir\audio.*"
      $anyPending = $true
    }
  }
}

if ($anyFail) { exit 3 }
if ($anyPending -and (-not $OnlyAvailable)) { exit 1 }
exit 0
