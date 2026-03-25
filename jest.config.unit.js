module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Setup files for unit tests - no real server initialization
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/test-setup.ts'],

  // Environment variable for unit tests
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

  // Test patterns - only unit tests
  testMatch: [
    '<rootDir>/src/__tests__/**/*.unit.test.ts',
    '<rootDir>/src/**/__tests__/**/*.unit.test.ts',
    '<rootDir>/src/**/*.test.ts'
  ],

  // Exclude integration tests
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/integration/',
    '/e2e/',
    '.*\\.integration\\.test\\.ts$',
    '.*\\.e2e\\.test\\.ts$'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
    '!src/api/server.ts',
    '!src/workers/index.ts',
  ],

  coverageDirectory: 'coverage/unit',
  coverageReporters: ['text', 'lcov', 'html'],

  // Coverage thresholds for unit tests (higher standards)
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Test timeout (shorter for unit tests)
  testTimeout: 10000,

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

  // Environment variables for unit tests
  testEnvironmentOptions: {
    NODE_ENV: 'test',
    TEST_TYPE: 'unit',
  },
};