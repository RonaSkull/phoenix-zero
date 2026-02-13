# sovereign-test-complete.ps1 - Script completo para testar fluxo sovereign
$ErrorActionPreference = 'Stop'

# 1. Configurações obrigatórias
$BASE = [string]$env:PHOENIX_ZERO_BASE_URL
if ([string]::IsNullOrWhiteSpace($BASE)) {
    $BASE = "https://phoenix-zero-web.onrender.com"
}

$API_KEY = [string]$env:PHOENIX_ZERO_SOVEREIGN_TEST_API_KEY
if ([string]::IsNullOrWhiteSpace($API_KEY)) {
    $API_KEY = [string]$env:PZ_API_KEY
}
if ([string]::IsNullOrWhiteSpace($API_KEY)) {
    $API_KEY = ""
}

$AGENT_ID = [string]$env:PHOENIX_ZERO_SOVEREIGN_AGENT_ID
if ([string]::IsNullOrWhiteSpace($AGENT_ID)) {
    $AGENT_ID = "a_test_1"
}

function Ensure-ApiKey([string]$base) {
    if (-not [string]::IsNullOrWhiteSpace($script:API_KEY)) { return }

    Write-Host "" 
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "0. AUTO-PROVISION (public agent-signup)" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan

    $signupBodyObj = @{ acceptsTermsVersion = 'v1'; acceptsFixedPricing = $true; name = 'sovereign_e2e_auto' }
    $signupBody = $signupBodyObj | ConvertTo-Json -Depth 10
    $u = ('{0}/api/public/agent-signup' -f $base)

    $resp = Invoke-RestMethod -Method POST -Uri $u -ContentType 'application/json' -Body $signupBody
    if (-not $resp -or -not $resp.ok -or -not $resp.tenant -or -not $resp.tenant.apiKey) {
        throw "Auto-provision failed: $($resp | ConvertTo-Json -Depth 20)"
    }
    $script:API_KEY = [string]$resp.tenant.apiKey
    Write-Host (('OK: provisioned tenantId={0}' -f [string]$resp.tenant.tenantId)) -ForegroundColor Green
}

Ensure-ApiKey -base $BASE

# Headers
$hSov = @{
    "x-api-key" = $API_KEY
}

# Função SHA256
function Sha256Hex([string]$s) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($s)
    $hash  = [Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
    -join ($hash | ForEach-Object { $_.ToString("x2") })
}

function Get-CheckoutStatus([string]$base, [hashtable]$headers, [string]$paymentId) {
    $u = ('{0}/api/checkout/status?paymentId={1}' -f $base, ([uri]::EscapeDataString($paymentId)))
    Invoke-RestMethod -Method GET -Uri $u -Headers $headers
}

function Wait-UntilPaid([string]$base, [hashtable]$headers, [string]$paymentId, [int]$timeoutSeconds = 900) {
    $deadline = (Get-Date).AddSeconds([Math]::Max(5, $timeoutSeconds))
    $last = $null
    while ((Get-Date) -lt $deadline) {
        $last = Get-CheckoutStatus -base $base -headers $headers -paymentId $paymentId
        $st = [string]$last.status
        Write-Host "Status: $st" -ForegroundColor DarkGray
        if ($st -eq 'paid') { return $last }
        if ($st -eq 'failed') { throw "Payment failed: $($last | ConvertTo-Json -Depth 20)" }
        Start-Sleep -Seconds 5
    }
    throw "Timeout waiting for paid. Last status: $($last | ConvertTo-Json -Depth 20)"
}

function Get-AgentProofs([string]$base, [hashtable]$headers, [string]$agentId, [int]$limit = 50) {
    $u = ('{0}/api/agents/{1}/proofs?limit={2}' -f $base, ([uri]::EscapeDataString($agentId)), $limit)
    Invoke-RestMethod -Method GET -Uri $u -Headers $headers
}

function Get-Gate([string]$base, [hashtable]$headers, [string]$agentId, [string]$taskId, [string]$taskType) {
    $u = ('{0}/api/agents/{1}/gate?taskId={2}&taskType={3}' -f $base, ([uri]::EscapeDataString($agentId)), ([uri]::EscapeDataString($taskId)), ([uri]::EscapeDataString($taskType)))
    Invoke-RestMethod -Method GET -Uri $u -Headers $headers
}

function Post-Execute([string]$base, [hashtable]$headers, [string]$agentId, [string]$taskId, [string]$taskType) {
    $u = ('{0}/api/agents/{1}/execute' -f $base, ([uri]::EscapeDataString($agentId)))
    $bodyObj = @{ taskId = $taskId; taskType = $taskType; input = @{ mode = 'sovereign_e2e'; ts = (Get-Date).ToString('o') } }
    $body = $bodyObj | ConvertTo-Json -Depth 20
    Invoke-RestMethod -Method POST -Uri $u -Headers $headers -ContentType "application/json" -Body $body
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "1. VALIDANDO API KEY (/api/pricing)" -ForegroundColor Cyan
Write-Host "========================================"
try {
    $pricing = Invoke-RestMethod -Method GET -Uri ('{0}/api/pricing' -f $BASE) -Headers $hSov
    Write-Host "OK: API Key valida!" -ForegroundColor Green
    Write-Host (('   Tenant: {0}' -f $pricing.tenantId))
    Write-Host (('   Sovereign: {0}' -f $pricing.sovereign.enabled))
    Write-Host (('   Crypto Enabled: {0}' -f $pricing.sovereign.cryptoProvider))
} catch {
    Write-Host "ERROR: ERRO AO VALIDAR API KEY:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "2. CRIANDO CHECKOUT CRYPTO" -ForegroundColor Cyan
Write-Host "========================================"

# Config do checkout
$OP         = "time_anchor_get"
$UNITS      = 2000  # $20.00
$TASK_TYPE  = $OP
$TASK_ID    = "sv_" + (Get-Date).ToString("yyyyMMdd_HHmmss")

Write-Host (('   Operation: {0}' -f $OP))
Write-Host (('   Units: {0} (= ${1})' -f $UNITS, ($UNITS/100)))
Write-Host (('   TaskId: {0}' -f $TASK_ID))
Write-Host (('   TaskType: {0}' -f $TASK_TYPE))

# Gera hashes
$inputEvidence  = (@{ taskId=$TASK_ID; operation=$OP; kind="demo_in" } | ConvertTo-Json -Compress -Depth 10)
$outputEvidence = (@{ taskId=$TASK_ID; operation=$OP; kind="demo_out" } | ConvertTo-Json -Compress -Depth 10)

$inHash  = "sha256:" + (Sha256Hex $inputEvidence)
$outHash = "sha256:" + (Sha256Hex $outputEvidence)

Write-Host (('   InputHash: {0}' -f $inHash))
Write-Host (('   OutputHash: {0}' -f $outHash))

# Monta body
$checkoutBodyObj = @{
    currency = "USD"
    providerHint = "crypto"
    lineItems = @(
        @{ operation = $OP; units = $UNITS }
    )
    proofMeta = @{
        agentId = $AGENT_ID
        taskId = $TASK_ID
        taskType = $TASK_TYPE
        taskInputHash = $inHash
        taskOutputHash = $outHash
    }
}

$checkoutBody = $checkoutBodyObj | ConvertTo-Json -Depth 30

try {
    $resp = Invoke-RestMethod -Method POST -Uri ('{0}/api/checkout/create' -f $BASE) -Headers $hSov -ContentType "application/json" -Body $checkoutBody
    
    Write-Host ""
    Write-Host "OK: CHECKOUT CRIADO!" -ForegroundColor Green
    Write-Host ""
    Write-Host (('   paymentId: {0}' -f $resp.paymentId))
    Write-Host (('   checkoutUrl: {0}' -f $resp.checkoutUrl))
    Write-Host (('   payCurrency: {0}' -f $resp.payCurrency))
    Write-Host (('   payAmount: {0}' -f $resp.payAmount))
    Write-Host (('   status: {0}' -f $resp.status))
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host "PRÓXIMO PASSO:" -ForegroundColor Yellow
    Write-Host (('Abra no browser: {0}' -f $resp.checkoutUrl))
    Write-Host "E clique em 'Next step' para pagar"
    Write-Host "========================================"
    
    $PAYMENT_ID = [string]$resp.paymentId
    if (-not $PAYMENT_ID) { throw "Missing paymentId in response" }

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "3. AGUARDANDO STATUS=PAID" -ForegroundColor Cyan
    Write-Host "========================================"
    Write-Host "Quando terminar o pagamento na UI, o webhook deve confirmar e o status vira paid." -ForegroundColor DarkYellow
    $paid = Wait-UntilPaid -base $BASE -headers $hSov -paymentId $PAYMENT_ID -timeoutSeconds 1800
    Write-Host "OK: Pago!" -ForegroundColor Green

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "4. BUSCANDO PPO (Payment Proof Object)" -ForegroundColor Cyan
    Write-Host "========================================"
    $proofsResp = Get-AgentProofs -base $BASE -headers $hSov -agentId $AGENT_ID -limit 50
    if (-not $proofsResp.ok) { throw "agents proofs not ok: $($proofsResp | ConvertTo-Json -Depth 20)" }
    $proof = $null
    foreach ($p in @($proofsResp.proofs)) {
        if ([string]$p.taskId -eq $TASK_ID -and [string]$p.taskType -eq $TASK_TYPE) { $proof = $p; break }
    }
    if (-not $proof) {
        if ($proofsResp.proofs -and $proofsResp.proofs.Count -gt 0) { $proof = $proofsResp.proofs[0] }
    }
    if (-not $proof -or -not $proof.id) {
        throw "PPO not found for taskId/taskType. Response: $($proofsResp | ConvertTo-Json -Depth 50)"
    }
    $PROOF_ID = [string]$proof.id
    Write-Host (('OK: PPO encontrado: {0}' -f $PROOF_ID)) -ForegroundColor Green

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "5. GATE + EXECUTE" -ForegroundColor Cyan
    Write-Host "========================================"
    $gate = Get-Gate -base $BASE -headers $hSov -agentId $AGENT_ID -taskId $TASK_ID -taskType $TASK_TYPE
    Write-Host ("Gate allowed: " + $gate.allowed + " (reason: " + $gate.reason + ")")
    if (-not $gate.allowed) { throw "Gate blocked: $($gate | ConvertTo-Json -Depth 20)" }
    $exec = Post-Execute -base $BASE -headers $hSov -agentId $AGENT_ID -taskId $TASK_ID -taskType $TASK_TYPE
    Write-Host "Execute response:" -ForegroundColor DarkGray
    $exec | ConvertTo-Json -Depth 50

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "6. VERIFICAÇÃO PÚBLICA" -ForegroundColor Cyan
    Write-Host "========================================"
    $pub = Invoke-RestMethod -Method GET -Uri ('{0}/api/guarantee-proofs/{1}' -f $BASE, $PROOF_ID)
    if (-not $pub.ok) { throw "guarantee-proof not ok: $($pub | ConvertTo-Json -Depth 20)" }
    Write-Host "OK: Public proof ok" -ForegroundColor Green
    Write-Host (('Verify page: {0}/verify/{1}' -f $BASE, $PROOF_ID)) -ForegroundColor Yellow
    Write-Host (('Guarantee JSON: {0}/api/guarantee-proofs/{1}' -f $BASE, $PROOF_ID)) -ForegroundColor Yellow

} catch {
    Write-Host ''
    Write-Host 'ERROR: ERRO AO CRIAR CHECKOUT' -ForegroundColor Red
    if ($_.Exception -and $_.Exception.Response) {
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $reader.BaseStream.Position = 0
            $reader.DiscardBufferedData()
            $body = $reader.ReadToEnd()
            Write-Host (('   Status: {0}' -f $_.Exception.Response.StatusCode))
            Write-Host (('   Body: {0}' -f $body))
        } catch {
            Write-Host $_.Exception.Message
        }
    } else {
        Write-Host $_.Exception.Message
    }
    exit 1
}
