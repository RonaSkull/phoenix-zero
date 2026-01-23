param(
  [string]$InputVideo = "",
  [int]$SegmentSeconds = 3,
  [ValidateSet('compat','strict')][string]$Mode = 'strict',
  [ValidateSet('sig+(wm|temporal)','sig+wm+temporal')][string]$Policy = 'sig+(wm|temporal)'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not $InputVideo) {
  $InputVideo = Join-Path (Get-Location) 'out\video3s.mp4'
  if (-not (Test-Path $InputVideo)) {
    & npm run make:testvideo -- --out $InputVideo --duration 9 | Out-Host
  }
}

if (-not (Test-Path $InputVideo)) {
  throw "Input video not found: $InputVideo"
}

$outDir = Join-Path (Get-Location) 'out\live'

$tsxCmd = Join-Path (Get-Location) 'node_modules\.bin\tsx.cmd'
$tsxRunner = if (Test-Path $tsxCmd) { $tsxCmd } else { 'tsx' }

$tsxCli = Join-Path (Get-Location) 'node_modules\tsx\dist\cli.cjs'

$cmdArgs = @(
  '.\scripts\live-demo.ts',
  '--in', $InputVideo,
  '--outDir', $outDir,
  '--segmentSeconds', "$SegmentSeconds",
  '--mode', $Mode,
  '--policy', "$Policy"
)

if (Test-Path $tsxCli) {
  & node $tsxCli @cmdArgs | Out-Host
} else {
  & $tsxRunner @cmdArgs | Out-Host
}
exit $LASTEXITCODE
