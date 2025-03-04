module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['unused-imports', '@typescript-eslint'],
  ignorePatterns: ['**/*.test.ts'],
  overrides: [
    {
      files: ['*.test.js', 'runner.ts'],
      rules: {
        '@typescript-eslint/no-unnecessary-condition': 'off',
      },
    },
  ],
  rules: {
    'no-constant-condition': 'off',
    'no-debugger': 'off',
    '@typescript-eslint/no-namespace': 'off',
    'no-empty': 'off',
    quotes: 'off',
    indent: 'off',
    'unused-imports/no-unused-imports': 'error',
    'no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        args: 'after-used',
        ignoreRestSiblings: false,
      },
    ],
    '@typescript-eslint/no-extra-semi': 'off',
    '@typescript-eslint/no-this-alias': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-unnecessary-condition': 'error',
    'linebreak-style': ['error', 'unix'],
    semi: ['error', 'never'],
  },
}
