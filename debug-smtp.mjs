#!/usr/bin/env node

/**
 * Debug script para verificar credenciais SMTP
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carregar .env
dotenv.config({ path: path.join(__dirname, '.env') });

console.log('=== SMTP Configuration Debug ===\n');

const config = {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  user: process.env.SMTP_USER,
  password: process.env.SMTP_PASSWORD,
  fromName: process.env.SMTP_FROM_NAME,
  fromEmail: process.env.SMTP_FROM_EMAIL,
};

console.log('Valores carregados do .env:');
console.log(JSON.stringify(config, null, 2));

console.log('\nComprimentos:');
console.log(`  Host: ${config.host?.length} chars`);
console.log(`  User: ${config.user?.length} chars`);
console.log(`  Password: ${config.password?.length} chars`);
console.log(`  Port: ${config.port}`);

console.log('\nCharacteres especiais na senha:');
if (config.password) {
  const specialChars = [...config.password].filter(c => !/[a-zA-Z0-9]/.test(c));
  specialChars.forEach((char, idx) => {
    console.log(`  [${idx}] "${char}" (code: ${char.charCodeAt(0)})`);
  });
}

console.log('\nTestando conexao SMTP...');

const transporter = nodemailer.createTransport({
  host: config.host,
  port: parseInt(config.port),
  secure: parseInt(config.port) === 465,
  auth: {
    user: config.user,
    pass: config.password,
  },
  logger: true,
  debug: true,
});

transporter.verify((error, success) => {
  if (error) {
    console.error('\n❌ ERRO DE CONEXAO:');
    console.error(error.message);
    console.error('\nDetalhes completos:');
    console.error(error);
  } else {
    console.log('\n✅ CONEXAO SMTP SUCESSO!');
    console.log('O servidor SMTP está pronto para enviar emails');
  }
});
