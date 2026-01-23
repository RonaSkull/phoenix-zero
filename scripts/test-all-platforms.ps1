param(
  [string]$OriginalVideo = "",
  [string]$AudioPath = "",
  [string]$CreatorId = "",
  [string]$WorkDir = "",
  [ValidateSet('compat','strict')][string]$Mode = "compat",
  [switch]$ForceStamp,
  [switch]$MuxAudio
)

$ErrorActionPreference = "Stop"

try { chcp 65001 | Out-Null } catch {}
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
if ([string]::IsNullOrWhiteSpace($WorkDir)) {
  $WorkDir = Join-Path $Root "platform-tests"
}

if ([string]::IsNullOrWhiteSpace($OriginalVideo) -or !(Test-Path $OriginalVideo)) {
  $outDir = Join-Path $Root "out"
  $auto = $null
  if (Test-Path $outDir) {
    $auto = Get-ChildItem -Path $outDir -Filter "*.mp4" -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -notmatch "(?i)watermarked" -and $_.Name -notmatch "(?i)reencoded" } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
  }

  if ($auto) {
    Write-Host "AVISO: arquivo de video nao encontrado: $OriginalVideo"
    Write-Host "Usando automaticamente o mp4 mais novo em .\\out: $($auto.FullName)"
    $OriginalVideo = $auto.FullName
  } else {
    throw "Arquivo de video nao encontrado: $OriginalVideo"
  }
}

$ProofDir = Join-Path $WorkDir "proofs"
$DownloadsDir = Join-Path $WorkDir "downloads"
$OutputDir = Join-Path $WorkDir "output"

New-Item -ItemType Directory -Force -Path $ProofDir | Out-Null
New-Item -ItemType Directory -Force -Path $DownloadsDir | Out-Null
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$ProofPath = Join-Path $ProofDir "original.proof.json"
$WatermarkedPath = Join-Path $OutputDir "watermarked.mp4"

$InputForStamp = $OriginalVideo

if ($MuxAudio) {
  if ([string]::IsNullOrWhiteSpace($AudioPath)) {
    $defaultAudio = Join-Path $Root "platform-tests\audio\output\audio.wav"
    if (Test-Path $defaultAudio) { $AudioPath = $defaultAudio }
  }

  if (!(Test-Path $AudioPath)) {
    throw "MuxAudio ativado, mas AudioPath nao encontrado: $AudioPath"
  }

  $ffmpeg = $null
  try { $ffmpeg = (node -p "require('ffmpeg-static')" 2>$null) } catch {}
  if ([string]::IsNullOrWhiteSpace($ffmpeg) -or !(Test-Path $ffmpeg)) {
    throw "Nao foi possivel localizar ffmpeg-static para muxar audio no video."
  }

  $withAudioPath = Join-Path $OutputDir "input-with-audio.mp4"
  & $ffmpeg -hide_banner -y -i "$OriginalVideo" -i "$AudioPath" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 96k -shortest "$withAudioPath" | Out-Null
  if (!(Test-Path $withAudioPath)) {
    throw "Falha ao criar input-with-audio.mp4 em: $withAudioPath"
  }
  $InputForStamp = $withAudioPath
}

$ProofMtime = $null
$WatermarkedMtime = $null
$RunId = (Get-Date).ToString('yyyyMMdd-HHmmss')

$NeedStamp = $ForceStamp -or !(Test-Path $ProofPath) -or !(Test-Path $WatermarkedPath)

if (!$NeedStamp) {
  Write-Host "Reutilizando arquivos existentes:"
  Write-Host "  $WatermarkedPath"
  Write-Host "  $ProofPath"
  Write-Host "(Use -ForceStamp para gerar um novo watermark/proof.)"
  Write-Host ""
}

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
  Write-Host "Stamping + embedding watermark (mode=$Mode)..."
  if ([string]::IsNullOrWhiteSpace($CreatorId)) {
    npm run stamp:wm -- --in "$InputForStamp" --out "$WatermarkedPath" --proof "$ProofPath" --mode "$Mode" --platform "whatsapp"
  } else {
    npm run stamp:wm -- --in "$InputForStamp" --out "$WatermarkedPath" --proof "$ProofPath" --creatorId "$CreatorId" --mode "$Mode" --platform "whatsapp"
  }

  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao gerar watermark/proof (stamp:wm)."
  }

  if (Test-Path $WatermarkedPath) {
    (Get-Item $WatermarkedPath).LastWriteTime = Get-Date
    $wmCopy = Join-Path $OutputDir ("watermarked-{0}.mp4" -f $RunId)
    Copy-Item -LiteralPath $WatermarkedPath -Destination $wmCopy -Force
  }
  if (Test-Path $ProofPath) {
    (Get-Item $ProofPath).LastWriteTime = Get-Date
    $proofCopy = Join-Path $ProofDir ("original.proof-{0}.json" -f $RunId)
    Copy-Item -LiteralPath $ProofPath -Destination $proofCopy -Force
  }
}

if (Test-Path $ProofPath) {
  $ProofMtime = (Get-Item $ProofPath).LastWriteTime
}
if (Test-Path $WatermarkedPath) {
  $WatermarkedMtime = (Get-Item $WatermarkedPath).LastWriteTime
}

Write-Host ""
Write-Host "Agora faca upload do VIDEO WATERMARKED gerado e depois baixe o video resultante (re-encoded)."
Write-Host "Arquivo a subir: $WatermarkedPath"
if ($WatermarkedMtime) {
  Write-Host ("  (gerado em: {0})" -f $WatermarkedMtime)
}
if ($ProofMtime) {
  Write-Host ("Proof atual: {0} (gerado em: {1})" -f $ProofPath, $ProofMtime)
}
Write-Host "Salve os arquivos assim:"
Write-Host "  $DownloadsDir\\whatsapp\\video.mp4"
Write-Host "  $DownloadsDir\\tiktok\\video.mp4"
Write-Host "  $DownloadsDir\\instagram\\video.mp4"
Write-Host "  $DownloadsDir\\youtube\\video.mp4"
Write-Host "  $DownloadsDir\\linkedin\\video.mp4"
Write-Host ""

$Platforms = @("whatsapp", "tiktok", "instagram", "youtube", "linkedin")

foreach ($p in $Platforms) {
  $dir = Join-Path $DownloadsDir $p
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $candidate = Join-Path $dir "video.mp4"

  if (!(Test-Path $candidate)) {
    $fallback = Get-ChildItem -Path $dir -Filter "*.mp4" -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($fallback) {
      $candidate = $fallback.FullName
    }
  }

  if (Test-Path $candidate) {
    if ($ProofMtime) {
      $candItem = Get-Item $candidate
      $candTime = $candItem.LastWriteTime
      if ($candItem.CreationTime -gt $candTime) { $candTime = $candItem.CreationTime }

      if ($candTime -lt $ProofMtime) {
        $newer = Get-ChildItem -Path $dir -Filter "*.mp4" -File -ErrorAction SilentlyContinue |
          Sort-Object LastWriteTime -Descending |
          Select-Object -First 1

        if ($newer) {
          $newItem = Get-Item $newer.FullName
          $newTime = $newItem.LastWriteTime
          if ($newItem.CreationTime -gt $newTime) { $newTime = $newItem.CreationTime }
          if ($newTime -ge $ProofMtime) {
            $candidate = $newer.FullName
          } else {
            Write-Host ""
            Write-Host "AVISO ${p}: o video baixado ($candidate) e mais antigo que o proof atual ($ProofPath)."
            Write-Host "Voce provavelmente rodou -ForceStamp e ainda nao fez upload/download do novo watermarked.mp4."
            Write-Host "Re-baixe o video e salve novamente em: $dir\\video.mp4"
            continue
          }
        } else {
          Write-Host ""
          Write-Host "AVISO ${p}: o video baixado ($candidate) e mais antigo que o proof atual ($ProofPath)."
          Write-Host "Voce provavelmente rodou -ForceStamp e ainda nao fez upload/download do novo watermarked.mp4."
          Write-Host "Re-baixe o video e salve novamente em: $dir\\video.mp4"
          continue
        }
      }
    }

    Write-Host ""
    Write-Host "Verificando ${p}: $candidate"
    npm run verify:wm -- --in "$candidate" --proof "$ProofPath" --platform "$p"
  } else {
    Write-Host ""
    Write-Host "Pendente $p. Coloque o arquivo em: $candidate"
  }
}
