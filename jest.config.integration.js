module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Setup files for integration tests - with real server
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/test-setup.ts'],

  // Environment variable for integration tests
  testEnvironmentOptions: {
    customExportConditions: [''],
  },

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

  // Test patterns - only integration tests
  testMatch: [
    '<rootDir>/src/__tests__/**/*.integration.test.ts',
    '<rootDir>/src/**/__tests__/**/*.integration.test.ts',
    '<rootDir>/contract-first/**/*.test.js'
  ],

  // Coverage configuration for integration tests
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
  ],

  coverageDirectory: 'coverage/integration',
  coverageReporters: ['text', 'lcov', 'html'],

  // Coverage thresholds for integration tests (lower standards)
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },

  // Test timeout (longer for integration tests)
  testTimeout: 30000,

  // Transform configuration
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },

  // Module file extensions
  moduleFileExtensions: ['ts', 'js', 'json'],

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true,

  // Environment variables for integration tests
  testEnvironmentOptions: {
    NODE_ENV: 'test',
    TEST_TYPE: 'integration',
  },
};