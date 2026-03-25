@echo off
REM Script de Teste de Webhooks ASAAS - Windows Batch
REM Uso: test-webhooks.bat [created|confirmed|received]

setlocal
set API_URL=http://localhost:3000/webhooks/asaas/subscription
set SECRET=dev_webhook_secret_here

echo.
echo ============================================
echo  ASAAS Webhook Local Testing
echo ============================================
echo.

if "%1"=="" (
    set EVENT=created
) else (
    set EVENT=%1
)

if "%EVENT%"=="created" goto test_created
if "%EVENT%"=="confirmed" goto test_confirmed
if "%EVENT%"=="received" goto test_received
goto end

:test_created
echo [TESTE] Enviando PAYMENT_CREATED ^(Trial Start^)...
curl -X POST %API_URL% -H "Content-Type: application/json" -H "asaas-access-token: %SECRET%" -d @test-webhook-payment-created.json
echo.
echo.
goto end

:test_confirmed
echo [TESTE] Enviando PAYMENT_CONFIRMED ^(Trial to Active^)...
curl -X POST %API_URL% -H "Content-Type: application/json" -H "asaas-access-token: %SECRET%" -d @test-webhook-payment-confirmed.json
echo.
echo.
goto end

:test_received
echo [TESTE] Enviando PAYMENT_RECEIVED ^(PIX^)...
curl -X POST %API_URL% -H "Content-Type: application/json" -H "asaas-access-token: %SECRET%" -d @test-webhook-payment-received.json
echo.
echo.
goto end

:end
echo ============================================
echo  Teste concluido!
echo ============================================
echo.
echo Proximos passos:
echo  1. Verificar logs da API
echo  2. Consultar tabela webhooks_asaas
echo  3. Consultar tabela subscriptions
echo.
