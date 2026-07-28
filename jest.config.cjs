const { CI } = process.env

/**
 * Jest config
 * @type {Config}
 */
module.exports = {
  verbose: true,
  resetMocks: true,
  resetModules: true,
  restoreMocks: true,
  clearMocks: true,
  silent: true,
  testMatch: ['<rootDir>/src/**/*.test.{cjs,js,mjs}'],
  reporters: CI
    ? [['github-actions', { silent: false }], 'summary']
    : ['default', 'summary'],
  collectCoverageFrom: ['<rootDir>/src/**/*.{cjs,js,mjs}'],
  coveragePathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.server'],
  modulePathIgnorePatterns: ['<rootDir>/coverage/', '<rootDir>/.server/'],
  coverageDirectory: '<rootDir>/coverage',
  setupFiles: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.(cjs|js|mjs)$': [
      'babel-jest',
      {
        plugins: ['transform-import-meta'],
        rootMode: 'upward'
      }
    ]
  },

  // Enable Babel transforms for node_modules
  // See: https://jestjs.io/docs/ecmascript-modules
  transformIgnorePatterns: [
    `node_modules/(?!${[
      '@defra/hapi-tracing', // Supports ESM only
      'oidc-provider', // Supports ESM only (as do these dependencies of it)
      '@koa/cors',
      '@koa/router',
      'jose',
      'nanoid',
      'quick-lru',
      'eta',
      'raw-body',
      'koa',
      'jsesc'
    ].join('|')}/)`
  ]
}

/**
 * @import { Config } from 'jest'
 */
