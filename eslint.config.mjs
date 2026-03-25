import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'dist/',
      'build/',
      'node_modules/',
      '**/*.js',
      'coverage/',
      'docker/',
      'supabase/'
    ]
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.eslint.json'
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'writable',
        module: 'writable',
        require: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['off', { argsIgnorePattern: '^_' }],
      'no-console': 'off'
    }
  },
  // 🎯 REGRA ESPECÍFICA PARA CONTROLLERS: no-explicit-any = ERROR
  {
    files: ['src/main/controller/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'error' // Bonus: Bloquear console.log também
    }
  },
  // 🧪 CONFIGURAÇÃO PARA ARQUIVOS DE TESTE: Jest globals
  {
    files: ['**/*.test.ts', '**/*.spec.ts', 'src/__tests__/**/*.ts'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
        pending: 'readonly',
        global: 'readonly',
        request: 'readonly',
        app: 'readonly',
        db: 'readonly',
        generateJWT: 'readonly',
        validJWT: 'readonly',
        jwtWithoutEmpresa: 'readonly',
        jwtUserId: 'readonly',
        jwtEmpresaId: 'readonly',
        user1Id: 'readonly',
        empresa1Id: 'readonly',
        user2Id: 'readonly',
        empresa2Id: 'readonly',
        differentEmpresaId: 'readonly',
        regularUserId: 'readonly',
        adminUserId: 'readonly',
        createCampanha: 'readonly',
        generateAsaasSignature: 'readonly',
        logger: 'readonly'
      }
    }
  }
];
