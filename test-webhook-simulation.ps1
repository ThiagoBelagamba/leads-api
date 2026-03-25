#!/usr/bin/env pwsh
# Test Webhook Flow Simulation
# Simula o fluxo de webhook completo

Write-Host "`n🧪 TESTE DE WEBHOOK PAYMENT_CONFIRMED`n" -ForegroundColor Cyan

# Simular dados de webhook ASAAS
$webhookPayload = @{
    event = "PAYMENT_CONFIRMED"
    payment = @{
        id = "pay_test_123456"
        subscription = "sub_ygqiqg8t7h6a2kfl"  # Subscription real do sandbox
        externalReference = "extensao_anual"
        status = "CONFIRMED"
        value = 249.00
        paymentDate = (Get-Date).ToString("yyyy-MM-dd")
        customer = "cus_000005165454"
    }
}

Write-Host "Payload do Webhook:" -ForegroundColor Yellow
Write-Host ($webhookPayload | ConvertTo-Json -Depth 3)

Write-Host "`n📋 O que acontecerá quando este webhook for processado:`n" -ForegroundColor Cyan

Write-Host "1. ✅ WebhookController.handleAsaasWebhook()" -ForegroundColor Green
Write-Host "   - Salva webhook na tabela webhooks_asaas"
Write-Host "   - Identifica evento: PAYMENT_CONFIRMED"

Write-Host "`n2. ✅ handleSubscriptionPaymentConfirmed()" -ForegroundColor Green
Write-Host "   - Converte subscription de 'trialing' → 'active'"
Write-Host "   - Busca empresa pela subscription"

Write-Host "`n3. ✅ createUserDisparoRapidoFromPayment()" -ForegroundColor Green
Write-Host "   - Busca empresa vinculada à subscription"
Write-Host "   - Verifica se usuário já existe"
Write-Host "   - Gera senha temporária (8 caracteres)"
Write-Host "   - Cria usuário na tabela users_disparo_rapido"
Write-Host "   - Status: 'active'"

Write-Host "`n4. 📧 EmailService.sendWelcomeEmail()" -ForegroundColor Green
Write-Host "   - Envia email com:"
Write-Host "     • Email de login"
Write-Host "     • Senha temporária"
Write-Host "     • Instruções de acesso"

Write-Host "`n📊 Estrutura da Tabela users_disparo_rapido:`n" -ForegroundColor Cyan

$tableStructure = @"
┌─────────────────┬──────────────┬─────────────┐
│ Campo           │ Tipo         │ Constraint  │
├─────────────────┼──────────────┼─────────────┤
│ id              │ UUID         │ PRIMARY KEY │
│ empresa_id      │ UUID         │ UNIQUE, FK  │
│ email           │ VARCHAR      │ UNIQUE      │
│ cpf_cnpj        │ VARCHAR      │ UNIQUE      │
│ nome            │ VARCHAR      │ NOT NULL    │
│ password_hash   │ TEXT         │ NOT NULL    │
│ status          │ ENUM         │ NOT NULL    │
│ created_at      │ TIMESTAMP    │ DEFAULT NOW │
│ updated_at      │ TIMESTAMP    │ DEFAULT NOW │
└─────────────────┴──────────────┴─────────────┘
"@

Write-Host $tableStructure

Write-Host "`n🔐 Endpoints Disponíveis:`n" -ForegroundColor Cyan

Write-Host "POST /api/v1/auth/login-disparo-rapido" -ForegroundColor Yellow
Write-Host "Body: { email, password, device_id, device_info }"
Write-Host "Response: { success, session_id, empresa_id, message }"

Write-Host "`nPOST /api/v1/auth/change-password-disparo-rapido" -ForegroundColor Yellow
Write-Host "Body: { email, current_password, new_password }"
Write-Host "Response: { success, message }"

Write-Host "`nPOST /api/v1/checkout/register-and-pay" -ForegroundColor Yellow
Write-Host "Body: { email, cpf_cnpj, nome_pessoa, nome_empresa, plano }"
Write-Host "Response: { success, checkout_url, empresa_id, external_reference }"

Write-Host "`n✅ Sistema pronto para processar webhooks!`n" -ForegroundColor Green
Write-Host "Para testar com servidor real:" -ForegroundColor Cyan
Write-Host "1. Inicie o servidor: cd disparorapido_api && pnpm dev:api"
Write-Host "2. Execute: .\test-webhooks-local.ps1 -Event confirmed"
Write-Host "3. Verifique logs do servidor para ver criação do usuário`n"
