module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/test-setup.ts'],
  
  // Module resolution
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
  
  // Test patterns
  testMatch: [
    '<rootDir>/src/__tests__/**/*.test.ts',
    '<rootDir>/src/**/*.test.ts'
  ],
  
  // Coverage configuration (desabilitado por padrão para performance)
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
    '!src/api/server.ts',
    '!src/workers/index.ts',
  ],
  
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary'], // Apenas resumo por padrão
  
  // Timeout reduzido para desenvolvimento
  testTimeout: 10000,
  
  // Transform configuration
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      isolatedModules: true,
    }],
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'js', 'json'],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
  
  // Performance optimizations
  verbose: false, // Reduz output
  clearMocks: true,
  restoreMocks: true,
  
  // Limita workers para não sobrecarregar a máquina
  maxWorkers: '50%', // Usa apenas 50% dos cores disponíveis
  
  // Cache para acelerar execuções subsequentes
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // Configurações específicas para desenvolvimento
  forceExit: true, // Força saída para evitar processos pendurados
  detectOpenHandles: false, // Desabilita detecção de handles abertos (mais rápido)
};
