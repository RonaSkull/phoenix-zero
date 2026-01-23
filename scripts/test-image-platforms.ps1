param(
  [string]$OriginalImage = "",
  [string]$CreatorId = "",
  [string]$WorkDir = "",
  [ValidateSet('compat','strict')][string]$Mode = "compat",
  [ValidateSet('png','jpeg')][string]$OutputFormat = "png",
  [int]$JpegQuality = 95,
  [switch]$ForceStamp,
  [switch]$IncludeTikTok
)

$ErrorActionPreference = "Stop"

try { chcp 65001 | Out-Null } catch {}
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
if ([string]::IsNullOrWhiteSpace($WorkDir)) {
  $WorkDir = Join-Path $Root "platform-tests\image"
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
$OutExt = if ($OutputFormat -eq 'jpeg') { 'jpg' } else { 'png' }
$WatermarkedPath = Join-Path $OutputDir ("watermarked.{0}" -f $OutExt)

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
  Write-Host "Stamping + embedding IMAGE watermark (mode=$Mode, format=$OutputFormat)..."

  $stampArgs = @('--out', "$WatermarkedPath", '--proof', "$ProofPath", '--mode', "$Mode", '--outputFormat', "$OutputFormat")
  if ($OutputFormat -eq 'jpeg') { $stampArgs += @('--jpegQuality', "$JpegQuality") }

  if (-not [string]::IsNullOrWhiteSpace($CreatorId)) { $stampArgs += @('--creatorId', "$CreatorId") }
  if (-not [string]::IsNullOrWhiteSpace($OriginalImage)) { $stampArgs += @('--in', "$OriginalImage") }

  npm run stamp:image:wm -- @stampArgs

  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao gerar watermark/proof (stamp:image:wm)."
  }

  if (Test-Path $WatermarkedPath) {
    (Get-Item $WatermarkedPath).LastWriteTime = Get-Date
    $wmCopy = Join-Path $OutputDir ("watermarked-{0}.{1}" -f $RunId, $OutExt)
    Copy-Item -LiteralPath $WatermarkedPath -Destination $wmCopy -Force
  }
  if (Test-Path $ProofPath) {
    (Get-Item $ProofPath).LastWriteTime = Get-Date
    $proofCopy = Join-Path $ProofDir ("original.proof-{0}.json" -f $RunId)
    Copy-Item -LiteralPath $ProofPath -Destination $proofCopy -Force
  }
}

$ProofMtime = $null
$WatermarkedMtime = $null
if (Test-Path $ProofPath) { $ProofMtime = (Get-Item $ProofPath).LastWriteTime }
if (Test-Path $WatermarkedPath) { $WatermarkedMtime = (Get-Item $WatermarkedPath).LastWriteTime }

Write-Host ""
Write-Host "Agora faca upload da IMAGEM WATERMARKED gerada e depois baixe a imagem resultante (re-encoded)."
Write-Host "Arquivo a subir: $WatermarkedPath"
if ($WatermarkedMtime) { Write-Host ("  (gerado em: {0})" -f $WatermarkedMtime) }
if ($ProofMtime) { Write-Host ("Proof atual: {0} (gerado em: {1})" -f $ProofPath, $ProofMtime) }
Write-Host "Salve os downloads por plataforma assim:" 
Write-Host "  $DownloadsDir\whatsapp\image.*"
Write-Host "  $DownloadsDir\instagram\image.*"
if ($IncludeTikTok) { Write-Host "  $DownloadsDir\tiktok\image.*" }
Write-Host "  $DownloadsDir\youtube\image.*"
Write-Host "  $DownloadsDir\linkedin\image.*"
Write-Host "  $DownloadsDir\twitter\image.*"
Write-Host "  $DownloadsDir\telegram\image.*"
Write-Host "  $DownloadsDir\discord\image.*"
Write-Host "  $DownloadsDir\slack\image.*"
Write-Host ""

$Platforms = @('whatsapp','instagram','youtube','linkedin','twitter','telegram','discord','slack')
if ($IncludeTikTok) { $Platforms = @('whatsapp','instagram','tiktok','youtube','linkedin','twitter','telegram','discord','slack') }

foreach ($p in $Platforms) {
  $dir = Join-Path $DownloadsDir $p
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

$anyFail = $false
$anyPending = $false

foreach ($p in $Platforms) {
  $dir = Join-Path $DownloadsDir $p

  $candidate = Join-Path $dir 'image.png'
  if (!(Test-Path $candidate)) { $candidate = Join-Path $dir 'image.jpg' }
  if (!(Test-Path $candidate)) { $candidate = Join-Path $dir 'image.jpeg' }
  if (!(Test-Path $candidate)) { $candidate = Join-Path $dir 'image.webp' }

  if (!(Test-Path $candidate)) {
    $fallback = Get-ChildItem -Path $dir -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match '\.(png|jpg|jpeg|webp)$' } |
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
        Write-Host "AVISO ${p}: a imagem baixada ($candidate) e mais antiga que o proof atual ($ProofPath)."
        Write-Host "Re-baixe e salve novamente em: $dir\image.*"
        $anyFail = $true
        continue
      }
    }

    Write-Host ""
    Write-Host "Verificando ${p}: $candidate"
    $reportPath = Join-Path $ReportsDir ("{0}-verify-{1}.json" -f $p, $RunId)
    npm run verify:image:wm -- --in "$candidate" --proof "$ProofPath" | Tee-Object -FilePath $reportPath | Out-Host
    if ($LASTEXITCODE -ne 0) { $anyFail = $true }
  } else {
    Write-Host ""
    Write-Host "Pendente ${p}. Coloque o arquivo em: $dir\image.*"
    $anyPending = $true
  }
}

if ($anyFail) { exit 3 }
if ($anyPending) { exit 1 }
exit 0
