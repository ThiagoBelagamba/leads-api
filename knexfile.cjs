/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
require('dotenv').config();

console.log('Knexfile loaded. DATABASE_URL:', process.env.DATABASE_URL);


module.exports = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL, // Usar variável de ambiente para a URL do banco de dados
    migrations: {
      directory: './supabase/migrations'
    },
    seeds: {
      directory: './supabase/seeds'
    }
  },
  
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: './supabase/migrations'
    },
    seeds: {
      directory: './supabase/seeds'
    },
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 100
    }
  }
};
