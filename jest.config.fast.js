module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/test-setup.ts'],
  
  // Module resolution básica
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@main/(.*)$': '<rootDir>/src/main/$1',
    '^@domain/(.*)$': '<rootDir>/src/main/domain/$1',
    '^@config/(.*)$': '<rootDir>/src/main/config/$1',
    '^@client/(.*)$': '<rootDir>/src/main/client/$1',
    '^@controller/(.*)$': '<rootDir>/src/main/controller/$1',
    '^@routes/(.*)$': '<rootDir>/src/main/routes/$1',
    '^@middleware/(.*)$': '<rootDir>/src/main/middleware/$1',
    '^@dto/(.*)$': '<rootDir>/src/main/dto/$1',
    '^@converter/(.*)$': '<rootDir>/src/main/converter/$1',
    '^@factory/(.*)$': '<rootDir>/src/main/factory/$1',
    '^@exception/(.*)$': '<rootDir>/src/main/exception/$1',
    '^@usecase/(.*)$': '<rootDir>/src/main/usecase/$1',
    '^@repository/(.*)$': '<rootDir>/src/main/repository/$1',
    '^@infra/(.*)$': '<rootDir>/src/main/infrastructure/$1',
    '^@infrastructure/(.*)$': '<rootDir>/src/main/infrastructure/$1',
    '^@util/(.*)$': '<rootDir>/src/main/util/$1',
    '^@container/(.*)$': '<rootDir>/src/main/container/$1',
    '^@worker/(.*)$': '<rootDir>/src/main/worker/$1',
    '^@/types/(.*)$': '<rootDir>/../types/$1',
    '^@types/(.*)$': '<rootDir>/../types/$1',
  },
  
  // Apenas testes unitários simples
  testMatch: [
    '<rootDir>/src/**/*.test.ts'
  ],
  
  // Sem coverage para máxima velocidade
  collectCoverage: false,
  
  // Timeout muito baixo
  testTimeout: 5000,
  
  // Transform mínimo
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      isolatedModules: true,
      transpileOnly: true,
    }],
  },
  
  // Extensions básicas
  moduleFileExtensions: ['ts', 'js'],
  
  // Ignore mais agressivo
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/src/__tests__/contract/',
    '/src/__tests__/integration/',
    '/src/__tests__/performance/',
    '/src/__tests__/e2e/',
  ],
  
  // Performance máxima
  verbose: false,
  silent: true, // Suprime logs para ser mais rápido
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,

  // Apenas 1 worker para evitar overhead
  maxWorkers: 1,
  
  // Cache agressivo
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache-fast',
  
  // Configurações ultra-rápidas
  forceExit: true,
  detectOpenHandles: false,
  detectLeaks: false,
};
