# Restart API server and test complete flow
Write-Host "`n🔄 Reiniciando servidor da API..." -ForegroundColor Cyan

# Kill any existing node processes
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Seconds 2

# Start API server in background
Write-Host "🚀 Iniciando servidor em background..." -ForegroundColor Green
$job = Start-Job -ScriptBlock {
    Set-Location "C:\workspace\workspace2\disparorapido_api"
    pnpm dev:api
}

# Wait for server to start
Write-Host "⏳ Aguardando servidor inicializar (10 segundos)..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Test if server is up
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/v1/version" -Method GET -ErrorAction Stop
    Write-Host "✅ Servidor respondendo!`n" -ForegroundColor Green
} catch {
    Write-Host "❌ Servidor não respondeu. Verifique os logs." -ForegroundColor Red
    Receive-Job -Job $job
    Remove-Job -Job $job -Force
    exit 1
}

# Run test
Write-Host "🧪 Executando teste completo...`n" -ForegroundColor Cyan
node scripts/test-complete-flow.js

Write-Host "`n📊 Verificando logs do último webhook..." -ForegroundColor Cyan
node scripts/check-latest-webhook.js

# Keep server running
Write-Host "`n✅ Teste concluído. Servidor ainda está rodando." -ForegroundColor Green
Write-Host "💡 Para parar o servidor: Get-Job | Stop-Job; Get-Job | Remove-Job`n" -ForegroundColor Yellow
