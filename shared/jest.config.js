export default {
  setupFiles: ['./jest/setup.js'],
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['bin/', 'dist/'],
  moduleNameMapper: {
    '^~/(.*)$': '<rootDir>/src/$1',
  },
}
