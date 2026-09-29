module.exports = {
  preset: 'ts-jest',
  // Tests are typechecked as well as run. This was transpile-only while the backend
  // carried ~235 type errors; with tsc at zero, a type error in a test is a failure.
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  // Env only, before any module loads — see the file's comment for why setup.ts is not used.
  setupFiles: ['<rootDir>/src/tests/env.setup.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**'
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  }
};
