module.exports = {
  preset: 'ts-jest',
  // Type errors are reported by `npm run build` (tsc), not by the test runner.
  // The backend currently has ~235 pre-existing type errors (the review's Phase 1),
  // and with ts-jest's default diagnostics any test that imports src/server.ts fails
  // on unrelated type errors elsewhere in the import graph. Transpile-only keeps the
  // runtime tests meaningful in the meantime.
  // TODO(Phase 1): once `tsc` reaches zero, delete this block to restore typechecking.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { diagnostics: false }]
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
