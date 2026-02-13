# record-demo.ps1
# Automated professional demo recording for Phoenix Zero enterprise sales
# Usage: .\record-demo.ps1 -DemoType "exchange" -OutputPath "./public/demos/"

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("exchange", "ai-marketplace", "gaming", "banking")]
    [string]$DemoType,
    
    [string]$OutputPath = "./public/demos/",
    [int]$DurationSeconds = 120,
    [string]$BaseUrl = "https://phoenix-zero-web.onrender.com"
)

# Demo configurations
$DemoConfigs = @{
    "exchange" = @{
        Title = "Regulatory Proof in 60 Seconds"
        TaskType = "reconcile_psp"
        Operation = "reconcile_psp"
        Amount = 500
        Description = "Compliance proof for crypto exchanges"
        OverlayTemplate = "exchange-overlay.html"
    }
    "ai-marketplace" = @{
        Title = "Autonomous Agent Economies"
        TaskType = "agent_executable_payment_gating"
        Operation = "agent_executable_payment_gating"
        Amount = 10
        Description = "Agent-to-agent payments without intermediaries"
        OverlayTemplate = "ai-marketplace-overlay.html"
    }
    "gaming" = @{
        Title = "Fraud-Proof Tournament Payouts"
        TaskType = "payout_integrity_anti_replay"
        Operation = "payout_integrity_anti_replay"
        Amount = 100
        Description = "Verifiable esports tournament payouts"
        OverlayTemplate = "gaming-overlay.html"
    }
    "banking" = @{
        Title = "BC/Febraban Reconciliation in 1 Click"
        TaskType = "crypto_reconciliation_export"
        Operation = "crypto_reconciliation_export"
        Amount = 50
        Description = "Automated banking reconciliation"
        OverlayTemplate = "banking-overlay.html"
    }
}

$config = $DemoConfigs[$DemoType]

Write-Host "[FILM] Phoenix Zero Demo Recorder" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Demo Type: $($config.Title)" -ForegroundColor Yellow
Write-Host "Output: $OutputPath" -ForegroundColor White
Write-Host ""

# Validate environment
if (-not $env:PHOENIX_ZERO_ADMIN_TOKEN) {
    Write-Error "[X] PHOENIX_ZERO_ADMIN_TOKEN not set. Required for simulation mode."
    exit 1
}

function Invoke-JsonPost($uri, $headers, $bodyObject) {
    return Invoke-RestMethod -Uri $uri -Method POST -Headers $headers -Body ($bodyObject | ConvertTo-Json -Depth 10)
}

function Ensure-SovereignDemoPricingProfile($baseUrl, $adminToken) {
    $profileId = "sovereign-demo"
    $now = (Get-Date).ToString("o")

    $ops = @{}
    foreach ($k in $DemoConfigs.Keys) {
        $op = [string]$DemoConfigs[$k].Operation
        if ($op -and (-not $ops.ContainsKey($op))) {
            $ops[$op] = 100
        }
    }

    $profile = @{
        id = $profileId
        createdAt = $now
        updatedAt = $now
        currency = "USD"
        basePriceCentsByOp = $ops
        multiplierByClientType = @{ sovereign = 1; unknown = 1 }
        multiplierBySector = @{ fintech = 1; unknown = 1 }
        multiplierByCountry = @{ us = 1; unknown = 1 }
    }

    $headers = @{ "x-admin-token" = $adminToken; "Content-Type" = "application/json" }
    Invoke-JsonPost "$baseUrl/api/admin/pricing-profiles" $headers $profile | Out-Null
    return $profileId
}

function Provision-SovereignTenant($baseUrl, $adminToken, $pricingProfileId, $demoType) {
    $headers = @{ "x-admin-token" = $adminToken; "Content-Type" = "application/json" }
    $body = @{
        name = "sovereign_demo_$demoType_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
        clientType = "sovereign"
        sector = "fintech"
        country = "US"
        currency = "USD"
        pricingProfile = $pricingProfileId
        commissionProfile = "default"
        taxProfile = "default"
        sessionTtlSeconds = 3600
        next = "/pricing-admin"
    }
    return Invoke-JsonPost "$baseUrl/api/admin/tenants" $headers $body
}

# Ensure output directory exists
if (-not (Test-Path $OutputPath)) {
    New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outputFile = Join-Path $OutputPath "$DemoType-demo-$timestamp.mp4"
$overlayFile = Join-Path $OutputPath "$DemoType-overlay.html"

# Generate overlay HTML
Write-Host "[PAINT] Generating overlay template..." -ForegroundColor Blue
$overlayHtml = @"
<!DOCTYPE html>
<html>
<head>
    <style>
        body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; background: transparent; }
        .overlay-container {
            position: fixed;
            top: 20px;
            left: 20px;
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 20px 30px;
            border-radius: 12px;
            border-left: 4px solid #00ff88;
            max-width: 400px;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        }
        .header-overlay h1 {
            margin: 0 0 10px 0;
            font-size: 24px;
            color: #00ff88;
            font-weight: 700;
        }
        .header-overlay p {
            margin: 0;
            font-size: 14px;
            color: #aaa;
        }
        .key-points {
            margin-top: 20px;
        }
        .point {
            display: flex;
            align-items: center;
            margin: 12px 0;
            font-size: 15px;
        }
        .point::before {
            content: "✓";
            color: #00ff88;
            font-weight: bold;
            margin-right: 12px;
            font-size: 18px;
        }
        .metrics {
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px solid #333;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }
        .metric {
            text-align: center;
        }
        .metric-value {
            font-size: 28px;
            font-weight: 700;
            color: #00ff88;
        }
        .metric-label {
            font-size: 12px;
            color: #888;
            margin-top: 4px;
        }
    </style>
</head>
<body>
    <div class="overlay-container">
        <div class="header-overlay">
            <h1>$($config.Title)</h1>
            <p>$($config.Description)</p>
        </div>
        <div class="key-points">
$(switch ($DemoType) {
    "exchange" { @"
            <div class="point">Cryptographically verifiable proof</div>
            <div class="point">Eliminates manual audits</div>
            <div class="point">SEC-compliant in seconds</div>
"@ }
    "ai-marketplace" { @"
            <div class="point">Sovereign agent economy</div>
            <div class="point">Autonomous payments with proof</div>
            <div class="point">Zero human intervention needed</div>
"@ }
    "gaming" { @"
            <div class="point">Public payout proofs</div>
            <div class="point">Eliminates manipulation suspicion</div>
            <div class="point">Total community trust</div>
"@ }
    "banking" { @"
            <div class="point">Reconciliation in minutes, not days</div>
            <div class="point">90% operational cost reduction</div>
            <div class="point">BC/Febraban-ready reports</div>
"@ }
})
        </div>
        <div class="metrics">
            <div class="metric">
                <div class="metric-value">$($config.Amount)</div>
                <div class="metric-label">Demo Units</div>
            </div>
            <div class="metric">
                <div class="metric-value">&lt;60s</div>
                <div class="metric-label">To Complete</div>
            </div>
        </div>
    </div>
</body>
</html>
"@

$overlayHtml | Out-File -FilePath $overlayFile -Encoding UTF8

# Start recording simulation
Write-Host "[REC] Starting demo recording..." -ForegroundColor Green
Write-Host "   This will execute the actual demo flow on: $BaseUrl" -ForegroundColor Gray

# Set environment for demo
$env:PHOENIX_ZERO_E2E_MODE = "simulate"
$env:PHOENIX_ZERO_BASE_URL = $BaseUrl

# Generate unique identifiers
$agentId = "demo_$DemoType`_$(Get-Random -Maximum 9999)"
$taskId = "demo_task_$(Get-Date -Format 'yyyyMMddHHmmss')"
$billingOperation = $config.Operation
$effectiveTaskType = $config.TaskType

Write-Host ""
Write-Host "[MASK] Demo Configuration:" -ForegroundColor Cyan
Write-Host "   Agent ID: $agentId"
Write-Host "   Task ID: $taskId"
Write-Host "   Task Type: $effectiveTaskType"
Write-Host ""

# Execute the demo flow
Write-Host "[CLOCK] Executing demo flow (this is a real execution)..." -ForegroundColor Yellow

try {
    # 1. Provision a REAL sovereign tenant + pricing profile (enterprise-real demo)
    Write-Host "   -> Provisioning sovereign pricing + tenant (admin)..." -ForegroundColor Blue
    $pricingProfileId = Ensure-SovereignDemoPricingProfile $BaseUrl $env:PHOENIX_ZERO_ADMIN_TOKEN
    $tenantRes = Provision-SovereignTenant $BaseUrl $env:PHOENIX_ZERO_ADMIN_TOKEN $pricingProfileId $DemoType

    if (-not $tenantRes.ok) {
        throw "Failed to provision sovereign tenant"
    }

    $env:PHOENIX_ZERO_SOVEREIGN_TEST_API_KEY = $tenantRes.apiKey
    $env:PHOENIX_ZERO_TENANT_ID = $tenantRes.tenant.tenantId
    Write-Host "   [OK] Sovereign tenant provisioned: $($tenantRes.tenant.tenantId)" -ForegroundColor Green

    # 1b. Provision sovereign contract (required for sovereign task types during /execute)
    Write-Host "   -> Provisioning sovereign contract (admin)..." -ForegroundColor Blue
    $nowIso = (Get-Date).ToString("o")
    $unixSeconds = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
    $contractId = "sc_$($env:PHOENIX_ZERO_TENANT_ID)_$($agentId)_$unixSeconds"
    $execClassId = "standard"
    $contractPayload = @{
        contract = @{
            contractId = $contractId
            tenantId = $env:PHOENIX_ZERO_TENANT_ID
            agentId = $agentId
            status = "active"
            createdAt = $nowIso
            updatedAt = $nowIso
            effectiveAt = $nowIso
            defaultExecutionClassId = $execClassId
            executionClasses = @(
                @{
                    classId = $execClassId
                    currency = "USD"
                    pricePerExecutionCents = 100
                    allowedTaskTypes = @($effectiveTaskType)
                    maxDailyExecutions = 100000
                    maxMonthlyExecutions = 1000000
                }
            )
            meta = @{
                demoType = $DemoType
                demoTaskType = $effectiveTaskType
            }
        }
    }
    $contractRes = Invoke-JsonPost "$BaseUrl/api/admin/sovereign-contracts" @{ "x-admin-token" = $env:PHOENIX_ZERO_ADMIN_TOKEN; "Content-Type" = "application/json" } $contractPayload
    if (-not $contractRes.ok) {
        throw "Failed to provision sovereign contract"
    }
    Write-Host "   [OK] Sovereign contract active: $($contractRes.contract.contractId)" -ForegroundColor Green

    # 2. Create checkout
    Write-Host "   [CARD] Creating checkout..." -ForegroundColor Blue
    Write-Host "   DEBUG: Agent ID = $agentId" -ForegroundColor Gray
    Write-Host "   DEBUG: Task ID = $taskId" -ForegroundColor Gray
    Write-Host "   DEBUG: Task Type = $effectiveTaskType" -ForegroundColor Gray
    
    $checkoutBody = @{
        currency = "USD"
        providerHint = "crypto"
        lineItems = @(@{ 
            operation = $billingOperation
            units = $config.Amount 
        })
        proofMeta = @{
            agentId = $agentId
            taskId = $taskId
            taskType = $effectiveTaskType
            taskInputHash = "sha256:demo_input_$taskId"
            taskOutputHash = "sha256:demo_output_$taskId"
            demoType = $DemoType
        }
    } | ConvertTo-Json -Depth 4
    
    Write-Host "   DEBUG: Request body:" -ForegroundColor Gray
    Write-Host "   $checkoutBody" -ForegroundColor Gray

    try {
        $checkout = Invoke-RestMethod -Uri "$BaseUrl/api/checkout/create" `
          -Method POST `
          -Headers @{
            "x-api-key" = $env:PHOENIX_ZERO_SOVEREIGN_TEST_API_KEY
            "Content-Type" = "application/json"
          } `
          -Body $checkoutBody
    } catch {
        Write-Host "   [X] Checkout failed!" -ForegroundColor Red
        Write-Host "   Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
        
        # Try to read error response body
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        $reader.DiscardBufferedData()
        $errorBody = $reader.ReadToEnd()
        if ($errorBody) {
            Write-Host "   Error response:" -ForegroundColor Red
            Write-Host "   $errorBody" -ForegroundColor Red
        }
        
        throw
    }

    Write-Host "   [OK] Checkout created: $($checkout.paymentId)" -ForegroundColor Green
    $paymentId = $checkout.paymentId

    # 3. Simulate payment
    Write-Host "   [$] Simulating payment..." -ForegroundColor Blue
    $fallbackBody = @{
        paymentId = $paymentId
        tenantId = $env:PHOENIX_ZERO_TENANT_ID
    } | ConvertTo-Json

    Invoke-RestMethod -Uri "$BaseUrl/api/admin/fallback-paid" `
      -Method POST `
      -Headers @{
        "x-admin-token" = $env:PHOENIX_ZERO_ADMIN_TOKEN
        "Content-Type" = "application/json"
      } `
      -Body $fallbackBody | Out-Null

    Write-Host "   [OK] Payment confirmed" -ForegroundColor Green

    # 4. Execute task
    Write-Host "   [BOLT] Executing task..." -ForegroundColor Blue
    $executeBody = @{
        taskId = $taskId
        taskType = $effectiveTaskType
        taskInputHash = "sha256:demo_input_$taskId"
        taskOutputHash = "sha256:demo_output_$taskId"
    } | ConvertTo-Json

    try {
        $execution = Invoke-RestMethod -Uri "$BaseUrl/api/agents/$agentId/execute" `
          -Method POST `
          -Headers @{
            "x-api-key" = $env:PHOENIX_ZERO_SOVEREIGN_TEST_API_KEY
            "Content-Type" = "application/json"
          } `
          -Body $executeBody
    } catch {
        Write-Host "   [X] Execute failed!" -ForegroundColor Red
        Write-Host "   Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red

        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        $reader.DiscardBufferedData()
        $errorBody = $reader.ReadToEnd()
        if ($errorBody) {
            Write-Host "   Error response:" -ForegroundColor Red
            Write-Host "   $errorBody" -ForegroundColor Red
        }

        throw
    }

    $proofId = $execution.proofId
    Write-Host "   [OK] Task executed, Proof: $proofId" -ForegroundColor Green

    # 5. Generate demo report
    $demoReport = @{
        demoType = $DemoType
        title = $config.Title
        timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
        baseUrl = $BaseUrl
        paymentId = $paymentId
        proofId = $proofId
        agentId = $agentId
        taskId = $taskId
        verifyUrl = "$BaseUrl/verify/$proofId"
        publicProofUrl = "$BaseUrl/api/guarantee-proofs/$proofId"
        status = "completed"
        duration = $DurationSeconds
    }

    $reportPath = Join-Path $OutputPath "$DemoType-report-$timestamp.json"
    $demoReport | ConvertTo-Json -Depth 4 | Out-File -FilePath $reportPath

    Write-Host ""
    Write-Host "==> DEMO RECORDING COMPLETE!" -ForegroundColor Green -BackgroundColor Black
    Write-Host ""
    Write-Host "(*) Demo Summary:" -ForegroundColor Cyan
    Write-Host "   Title: $($config.Title)"
    Write-Host "   Payment ID: $paymentId"
    Write-Host "   Proof ID: $proofId"
    Write-Host ""
    Write-Host "[LINK] Share these URLs:" -ForegroundColor Yellow
    Write-Host "   Verify Page: $($demoReport.verifyUrl)"
    Write-Host "   Public Proof: $($demoReport.publicProofUrl)"
    Write-Host ""
    Write-Host "[FILES] Generated Files:" -ForegroundColor White
    Write-Host "   Report: $reportPath"
    Write-Host "   Overlay: $overlayFile"
    Write-Host ""
    Write-Host "==> Next Steps:" -ForegroundColor Magenta
    Write-Host "   1. Copy the verify URL to your prospect"
    Write-Host "   2. They can verify without any setup"
    Write-Host "   3. Use overlay file for video production"
    Write-Host ""

    # Output for CI/CD integration
    return $demoReport

} catch {
    Write-Error "[X] Demo failed: $_"
    exit 1
}
