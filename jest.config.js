module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Setup files - will be overridden by specific configs
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
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
    '!src/api/server.ts', // Exclude main server file
    '!src/workers/index.ts', // Exclude main worker file
  ],
  
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    },
    './src/services/': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // Test timeout (30s for integration tests)
  testTimeout: 30000,
  
  // Transform configuration
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'js', 'json'],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
};