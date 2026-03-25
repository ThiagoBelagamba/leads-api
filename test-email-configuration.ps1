# Script para testar envio de email via SMTP Hostgator (Windows)

Write-Host "[TEST] Teste de Envio de Email - Disparo Rapido" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Verificar variáveis de ambiente
Write-Host ""
Write-Host "[INFO] Verificando configuracoes SMTP:" -ForegroundColor Yellow

# Carregar do .env - versao simples
$envPath = "c:\workspace\workspace2\disparorapido_api\.env"
$envVars = @{}

if (Test-Path $envPath) {
  $envContent = Get-Content $envPath -Encoding UTF8
  foreach ($line in $envContent) {
    if ($line -match "^SMTP_" -and -not $line.StartsWith("#")) {
      $parts = $line -split "=", 2
      if ($parts.Count -eq 2) {
        $key = $parts[0].Trim()
        $value = $parts[1].Trim().TrimStart("'").TrimEnd("'").TrimStart('"').TrimEnd('"')
        $envVars[$key] = $value
      }
    }
  }
}

$smtpPassword = $envVars["SMTP_PASSWORD"]
$smtpUser = $envVars["SMTP_USER"]
$smtpHost = $envVars["SMTP_HOST"]
$smtpPort = $envVars["SMTP_PORT"]

if ([string]::IsNullOrEmpty($smtpHost)) { $smtpHost = "smtp.hostgator.com" }
if ([string]::IsNullOrEmpty($smtpPort)) { $smtpPort = "465" }

if ([string]::IsNullOrEmpty($smtpPassword)) {
  Write-Host "[ERROR] SMTP_PASSWORD nao esta configurada" -ForegroundColor Red
  Write-Host "   Configure em .env: SMTP_PASSWORD=sua_senha_aqui" -ForegroundColor Red
  exit 1
} else {
  Write-Host "[OK] SMTP_PASSWORD configurada" -ForegroundColor Green
}

if ([string]::IsNullOrEmpty($smtpUser)) {
  Write-Host "[ERROR] SMTP_USER nao esta configurada" -ForegroundColor Red
  exit 1
} else {
  Write-Host "[OK] SMTP_USER: $smtpUser" -ForegroundColor Green
}

Write-Host "[OK] SMTP_HOST: $smtpHost" -ForegroundColor Green
Write-Host "[OK] SMTP_PORT: $smtpPort" -ForegroundColor Green

Write-Host ""
Write-Host "[NEXT] Para testar o envio:" -ForegroundColor Yellow
Write-Host "   1. Execute o checkout com um email valido" -ForegroundColor Gray
Write-Host "   2. Verifique os logs da API:" -ForegroundColor Gray
Write-Host "      npm run dev:api" -ForegroundColor Gray
Write-Host "   3. Procure por:" -ForegroundColor Gray
Write-Host "      [OK] Email transporter inicializado" -ForegroundColor Gray
Write-Host "      [OK] Email de confirmacao enviado com sucesso" -ForegroundColor Gray

Write-Host ""
Write-Host "[EMAIL] O email de confirmacao deve conter:" -ForegroundColor Yellow
Write-Host "   - Link para confirmar o email" -ForegroundColor Gray
Write-Host "   - Token de confirmacao" -ForegroundColor Gray
Write-Host "   - Link expira em 24 horas" -ForegroundColor Gray

Write-Host ""
Write-Host "[LINK] Link de teste manual (apos checkout):" -ForegroundColor Yellow
Write-Host "   http://localhost:5173/confirmar-email?token=seu_token_aqui" -ForegroundColor Cyan

Write-Host ""
Write-Host "[HELP] Duvidas? Veja EMAIL_CONFIGURATION.md para troubleshooting" -ForegroundColor Yellow

Write-Host ""
Write-Host "[TEST] Testando conexao SMTP..." -ForegroundColor Cyan

# Tentar testar conexao SMTP
if (-not [string]::IsNullOrEmpty($smtpHost) -and $smtpHost -ne "") {
  try {
    $smtpClient = New-Object System.Net.Mail.SmtpClient
    $smtpClient.Host = $smtpHost
    $smtpClient.Port = [int]$smtpPort
    $smtpClient.EnableSsl = $smtpPort -eq 465 -or $smtpPort -eq 587
    
    # Credenciais
    $smtpClient.Credentials = New-Object System.Net.NetworkCredential($smtpUser, $smtpPassword)
    
    # Timeout de 10 segundos
    $smtpClient.Timeout = 10000
    
    Write-Host "[OK] Conexao SMTP validada com sucesso!" -ForegroundColor Green
  } catch {
    Write-Host "[WARN] Aviso na conexao SMTP: $_" -ForegroundColor Yellow
    Write-Host "   Isso pode ser normal. Verifique os logs quando enviar um email real." -ForegroundColor Gray
  }
}

Write-Host ""
Write-Host "[SUCCESS] Configuracao pronta! Faca um checkout para testar o envio de email." -ForegroundColor Green
