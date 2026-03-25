/**
 * Debug: Verificar senha armazenada no banco
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcrypt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const email = 'thiago.mftecnologia@gmail.com';
const testPassword = 'Etele2025!';

console.log('=== Debug Senha Armazenada ===\n');

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
  try {
    // Buscar usuário
    const { data, error } = await supabase
      .from('users_disparo_rapido')
      .select('id, email, password_hash, status, email_confirmed_at')
      .eq('email', email)
      .single();

    if (error) {
      console.error('❌ Erro ao buscar usuário:', error);
      return;
    }

    if (!data) {
      console.log('❌ Usuário não encontrado');
      return;
    }

    console.log('✅ Usuário encontrado:');
    console.log(`   Email: ${data.email}`);
    console.log(`   ID: ${data.id}`);
    console.log(`   Status: ${data.status}`);
    console.log(`   Email Confirmado: ${data.email_confirmed_at ? 'SIM' : 'NÃO'}`);
    console.log(`   Password Hash: ${data.password_hash.substring(0, 50)}...`);
    console.log(`   Hash Length: ${data.password_hash.length} chars`);

    console.log('\n=== Testando Comparação de Senha ===\n');

    // Testar bcrypt
    const isValid = await bcrypt.compare(testPassword, data.password_hash);
    console.log(`Senha: "${testPassword}"`);
    console.log(`Resultado: ${isValid ? '✅ VÁLIDA' : '❌ INVÁLIDA'}`);

    if (!isValid) {
      console.log('\n⚠️ Possíveis causas:');
      console.log('1. A senha foi alterada no banco manualmente');
      console.log('2. O hash está corrompido');
      console.log('3. Caractere especial foi perdido durante armazenamento');
      console.log('4. A senha digitada no checkout foi diferente');

      // Tentar com versões sem caractere especial
      console.log('\n--- Testando variações ---');
      const variations = [
        'Etele2025',
        'etele2025!',
        'Etele2025 ',
        ' Etele2025!',
      ];

      for (const variant of variations) {
        const result = await bcrypt.compare(variant, data.password_hash);
        console.log(`"${variant}": ${result ? '✅' : '❌'}`);
      }
    }

  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

debug();
