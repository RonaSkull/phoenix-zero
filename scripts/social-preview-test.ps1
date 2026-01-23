param(
  [string]$Base = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"

try {
  $OutputEncoding = [System.Text.UTF8Encoding]::new()
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
} catch {
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$PlatformsFile = Join-Path $PSScriptRoot "social\platforms.json"

function New-ShareLink {
  param(
    [string]$BaseUrl,
    [string]$ApiKey
  )

  $body = @{ videoUrl = "$BaseUrl/demo/assets/v1/watermarked.mp4"; proofUrl = "$BaseUrl/demo/assets/v1/proof.json" } | ConvertTo-Json
  return Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/share-link" -ContentType "application/json" -Body $body -Headers @{ 'x-api-key' = $ApiKey }
}

function Get-TestApiKey {
  param([string]$BaseUrl)

  if ($env:PHOENIX_ZERO_TEST_API_KEY -and $env:PHOENIX_ZERO_TEST_API_KEY.Trim()) {
    return $env:PHOENIX_ZERO_TEST_API_KEY.Trim()
  }

  $hdr = @{}
  $admin = ($env:PHOENIX_ZERO_ADMIN_TOKEN + '').Trim()
  if ($admin) { $hdr['x-admin-token'] = $admin }

  $payload = @{ name = "social-preview-$([Guid]::NewGuid().ToString('n').Substring(0, 8))" } | ConvertTo-Json
  $resp = Invoke-WebRequest -Method Post -Uri "$BaseUrl/api/admin/tenants" -ContentType 'application/json' -Body $payload -Headers $hdr
  $json = $null
  try { $json = $resp.Content | ConvertFrom-Json } catch { $json = $null }
  if ($json -and $json.ok -and $json.apiKey) {
    return [string]$json.apiKey
  }

  throw 'Failed to provision test tenant apiKey via /api/admin/tenants'
}

function Get-FirstMatch {
  param(
    [string]$Text,
    [string]$Pattern
  )

  $opts = [System.Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [System.Text.RegularExpressions.RegexOptions]::Multiline
  $m = [regex]::Match($Text, $Pattern, $opts)
  if ($m.Success -and $m.Groups.Count -ge 2) { return $m.Groups[1].Value }
  return ""
}

function Get-AllMatches {
  param(
    [string]$Text,
    [string]$Pattern
  )

  $opts = [System.Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [System.Text.RegularExpressions.RegexOptions]::Multiline
  $ms = [regex]::Matches($Text, $Pattern, $opts)
  $out = @()
  foreach ($m in $ms) {
    if ($m.Success -and $m.Groups.Count -ge 2) {
      $v = [string]$m.Groups[1].Value
      if ($v) { $out += $v }
    }
  }
  return @($out | Select-Object -Unique)
}

$platforms = @()

if (Test-Path $PlatformsFile) {
  $cfg = Get-Content $PlatformsFile -Raw | ConvertFrom-Json
  if ($cfg.platforms) {
    foreach ($p in $cfg.platforms) {
      if ($p.name -and $p.ua) {
        $platforms += @{ name = [string]$p.name; ua = [string]$p.ua }
      }
    }
  }
}

if ($platforms.Count -eq 0) {
  $platforms = @(
    @{ name = "WhatsApp"; ua = "WhatsApp/2.23.0" },
    @{ name = "Telegram"; ua = "TelegramBot (like TwitterBot)" },
    @{ name = "Discord"; ua = "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)" },
    @{ name = "Slack"; ua = "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)" },
    @{ name = "Twitter/X"; ua = "Twitterbot/1.0" },
    @{ name = "Facebook"; ua = "facebookexternalhit/1.1" },
    @{ name = "LinkedIn"; ua = "LinkedInBot/1.0" },
    @{ name = "Instagram"; ua = "Instagram 155.0.0.37.107" },
    @{ name = "TikTok"; ua = "TikTok 26.2.1" },
    @{ name = "Googlebot"; ua = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }
  )
}

Write-Host "Base: $Base"
$apiKey = Get-TestApiKey -BaseUrl $Base
$share = New-ShareLink -BaseUrl $Base -ApiKey $apiKey
$id = $share.id
$shareUrl = $share.shareUrl

Write-Host "ShareId: $id"
Write-Host "ShareUrl: $shareUrl"

foreach ($p in $platforms) {
  $name = $p.name
  $ua = $p.ua

  Write-Host "\n=== $name ==="

  $htmlLines = curl.exe -s -H "User-Agent: $ua" $shareUrl
  $html = ($htmlLines -join "`n")

  $ogTitle = Get-FirstMatch -Text $html -Pattern 'property="og:title"\s+content="([^"]+)"'
  $ogImages = Get-AllMatches -Text $html -Pattern 'property="og:image"\s+content="([^"]+)"'
  $ogImage = if ($ogImages.Count -ge 1) { [string]$ogImages[0] } else { "" }
  $twCard = Get-FirstMatch -Text $html -Pattern 'name="twitter:card"\s+content="([^"]+)"'
  $twImage = Get-FirstMatch -Text $html -Pattern 'name="twitter:image"\s+content="([^"]+)"'

  if (-not $ogTitle) { Write-Host "[FAIL] Missing og:title" -ForegroundColor Red } else { Write-Host "[OK] og:title=$ogTitle" }
  if (-not $ogImage) { Write-Host "[FAIL] Missing og:image" -ForegroundColor Red } else { Write-Host "[OK] og:image=$ogImage" }
  if (-not $twCard) { Write-Host "[WARN] Missing twitter:card" -ForegroundColor Yellow } else { Write-Host "[OK] twitter:card=$twCard" }
  if (-not $twImage) { Write-Host "[WARN] Missing twitter:image" -ForegroundColor Yellow } else { Write-Host "[OK] twitter:image=$twImage" }

  if ($ogImages.Count -ge 2) {
    $hasJpg = ($ogImages | Where-Object { $_ -match 'share-card-jpg' }).Count -gt 0
    $hasPng = ($ogImages | Where-Object { $_ -match 'share-card-png' }).Count -gt 0
    if (-not $hasJpg -or -not $hasPng) {
      Write-Host "[WARN] og:image list is missing jpg or png variant" -ForegroundColor Yellow
    }
  } else {
    Write-Host "[WARN] Found only $($ogImages.Count) og:image tags" -ForegroundColor Yellow
  }

  foreach ($img in $ogImages) {
    if (-not $img) { continue }
    $headLines = curl.exe -sI -H "User-Agent: $ua" $img
    $head = ($headLines -join "`n")
    $status = Get-FirstMatch -Text $head -Pattern '^HTTP/\S+\s+(\d+)'
    $ctype = (Get-FirstMatch -Text $head -Pattern '^Content-Type:\s*([^\r\n]+)')
    $ctype = ($ctype -replace '\s+$','')

    if ($status -ne "200") {
      Write-Host "[FAIL] og:image HEAD status=$status url=$img" -ForegroundColor Red
    } else {
      Write-Host "[OK] og:image HEAD status=200 url=$img"
    }

    if ($ctype -match 'image/(png|jpeg)') {
      Write-Host "[OK] og:image Content-Type=$ctype"
    } else {
      Write-Host "[WARN] og:image Content-Type=$ctype" -ForegroundColor Yellow
    }
  }
}

Write-Host "\nDone."
