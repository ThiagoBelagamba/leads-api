#!/usr/bin/env pwsh
# Test Disparo Rapido Flow
# Testa o fluxo completo: register -> checkout -> webhook -> user creation

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "🧪 TESTE DE FLUXO DISPARO RÁPIDO" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$API_BASE = "http://localhost:3000/api/v1"

# 1. Teste de Registro + Checkout
Write-Host "📝 ETAPA 1: Registro + Checkout" -ForegroundColor Yellow
Write-Host "POST $API_BASE/checkout/register-and-pay`n"

$registerPayload = @{
    email = "teste@disparorapido.com"
    cpf_cnpj = "12345678900"
    nome_pessoa = "João Teste"
    nome_empresa = "Empresa Teste Ltda"
    plano = "mensal"
} | ConvertTo-Json

try {
    $registerResponse = Invoke-RestMethod `
        -Uri "$API_BASE/checkout/register-and-pay" `
        -Method POST `
        -ContentType "application/json" `
        -Body $registerPayload
    
    Write-Host "✅ Empresa criada:" -ForegroundColor Green
    Write-Host ($registerResponse | ConvertTo-Json -Depth 3)
    
    $empresaId = $registerResponse.empresa_id
    $externalReference = $registerResponse.external_reference
    
} catch {
    Write-Host "❌ Erro ao registrar:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host $_.ErrorDetails.Message
    exit 1
}

Write-Host "`n========================================`n" -ForegroundColor Cyan

# 2. Simular Webhook PAYMENT_CONFIRMED
Write-Host "💳 ETAPA 2: Simulando Webhook PAYMENT_CONFIRMED" -ForegroundColor Yellow
Write-Host "POST $API_BASE/webhooks/asaas/subscription`n"

$webhookPayload = @{
    event = "PAYMENT_CONFIRMED"
    payment = @{
        id = "pay_test_$(Get-Random)"
        subscription = "sub_test_$(Get-Random)"
        externalReference = $externalReference
        status = "CONFIRMED"
        value = 97.00
        paymentDate = (Get-Date).ToString("yyyy-MM-dd")
    }
} | ConvertTo-Json -Depth 3

try {
    $webhookResponse = Invoke-RestMethod `
        -Uri "$API_BASE/webhooks/asaas/subscription" `
        -Method POST `
        -ContentType "application/json" `
        -Body $webhookPayload `
        -Headers @{
            "asaas-access-token" = $env:ASAAS_API_KEY
        }
    
    Write-Host "✅ Webhook processado:" -ForegroundColor Green
    Write-Host ($webhookResponse | ConvertTo-Json)
    
} catch {
    Write-Host "⚠️ Webhook falhou (isso é esperado se o servidor não estiver rodando):" -ForegroundColor Yellow
    Write-Host $_.Exception.Message
}

Write-Host "`n========================================`n" -ForegroundColor Cyan

# 3. Teste de Login
Write-Host "🔐 ETAPA 3: Teste de Login (usar senha do email)" -ForegroundColor Yellow
Write-Host "POST $API_BASE/auth/login-disparo-rapido`n"

$senhaTemp = Read-Host "Digite a senha temporária recebida por email"

$loginPayload = @{
    email = "teste@disparorapido.com"
    password = $senhaTemp
    device_id = "test-device-$(Get-Random)"
    device_info = @{
        user_agent = "Test/1.0"
        ip_address = "127.0.0.1"
    }
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod `
        -Uri "$API_BASE/auth/login-disparo-rapido" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginPayload
    
    Write-Host "✅ Login bem-sucedido:" -ForegroundColor Green
    Write-Host ($loginResponse | ConvertTo-Json)
    
    $sessionId = $loginResponse.session_id
    
} catch {
    Write-Host "⚠️ Login falhou:" -ForegroundColor Yellow
    Write-Host $_.Exception.Message
    Write-Host $_.ErrorDetails.Message
}

Write-Host "`n========================================`n" -ForegroundColor Cyan

# 4. Teste de Alteração de Senha
Write-Host "🔑 ETAPA 4: Alteração de Senha" -ForegroundColor Yellow
Write-Host "POST $API_BASE/auth/change-password-disparo-rapido`n"

$novaSenha = Read-Host "Digite a nova senha"

$changePasswordPayload = @{
    email = "teste@disparorapido.com"
    current_password = $senhaTemp
    new_password = $novaSenha
} | ConvertTo-Json

try {
    $changeResponse = Invoke-RestMethod `
        -Uri "$API_BASE/auth/change-password-disparo-rapido" `
        -Method POST `
        -ContentType "application/json" `
        -Body $changePasswordPayload
    
    Write-Host "✅ Senha alterada:" -ForegroundColor Green
    Write-Host ($changeResponse | ConvertTo-Json)
    
} catch {
    Write-Host "⚠️ Alteração de senha falhou:" -ForegroundColor Yellow
    Write-Host $_.Exception.Message
    Write-Host $_.ErrorDetails.Message
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "✅ TESTE COMPLETO" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan
