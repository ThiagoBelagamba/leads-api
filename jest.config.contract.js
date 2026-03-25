module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Setup common test bootstrap (app, logger, etc.)
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/test-setup.ts'],

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
  },

  testMatch: ['<rootDir>/src/__tests__/contract/**/*.test.ts'],

  collectCoverage: false,

  transform: {
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true, transpileOnly: true }],
  },

  moduleFileExtensions: ['ts', 'js'],

  // Contract tests are heavier; allow more time
  testTimeout: 30000,

  // Keep output visible for debugging
  verbose: true,
  silent: false,

  maxWorkers: 1,

  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache-contract',
};
