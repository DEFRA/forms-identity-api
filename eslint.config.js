import prettierConfig from 'eslint-config-prettier'
import { importX } from 'eslint-plugin-import-x'
import jest from 'eslint-plugin-jest'
import jsdocPlugin from 'eslint-plugin-jsdoc'
import globals from 'globals'
import neostandard from 'neostandard'
import tseslint from 'typescript-eslint'

/**
 * Shared JSDoc rules (applied to all files, after recommended configs)
 * @satisfies {Partial<Record<string, import('eslint').Linter.RuleEntry>>}
 */
const jsdocRules = /** @type {const} */ ({
  // Check for valid formatting
  'jsdoc/check-line-alignment': [
    'warn',
    'never',
    {
      tags: ['param', 'property', 'typedef', 'returns']
    }
  ],

  // Require hyphens before param description
  // Aligns with TSDoc style: https://tsdoc.org/pages/tags/param/
  'jsdoc/require-hyphen-before-param-description': [
    'warn',
    'always',
    {
      tags: {
        param: 'always',
        property: 'always',
        returns: 'never'
      }
    }
  ],

  // JSDoc blocks are mandatory for classes and methods
  'jsdoc/require-jsdoc': [
    'error',
    {
      enableFixer: false,
      require: {
        ClassDeclaration: true,
        ClassExpression: true,
        FunctionExpression: false,
        MethodDefinition: true
      }
    }
  ],

  // Disable jsdoc v63 new rules that produce too many warnings in this codebase
  'jsdoc/reject-any-type': 'off',
  'jsdoc/reject-function-type': 'off',

  // JSDoc @param types are mandatory for JavaScript
  'jsdoc/require-param-description': 'off',
  'jsdoc/require-param-type': 'error',
  'jsdoc/require-param': 'off',

  // JSDoc @returns is optional
  'jsdoc/require-returns-description': 'off',
  'jsdoc/require-returns-type': 'off',
  'jsdoc/require-returns': 'off'
})

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      '.server',
      '.server/**',
      'coverage',
      'coverage/**',
      'node_modules',
      'node_modules/**',
      'node_modules/.*'
    ]
  },

  // Base neostandard config (replaces eslint-config-standard + n + promise)
  ...neostandard({ ts: true, noStyle: true }),

  // TypeScript strict + stylistic type-checked
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // JSDoc recommended
  jsdocPlugin.configs['flat/recommended'],

  // Base config for all files
  {
    plugins: {
      // Provided by neostandard until v0.13 removed it
      'import-x': importX
    },
    languageOptions: {
      ecmaVersion: 'latest',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      'no-console': 'error',

      // https://github.com/typescript-eslint/typescript-eslint/issues/11068
      '@typescript-eslint/no-useless-default-assignment': 'off',

      // Don't show eslint warnings for types - let TS handle
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',

      // Check type support for template string implicit `.toString()`
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowBoolean: true,
          allowNumber: true
        }
      ],

      // Skip rules handled by TypeScript compiler
      'import-x/default': 'off',
      'import-x/extensions': 'off',
      'import-x/named': 'off',
      'import-x/namespace': 'off',
      'import-x/no-named-as-default': 'off',
      'import-x/no-named-as-default-member': 'off',
      'import-x/no-unresolved': 'off',

      // Check import or require statements are A-Z ordered
      'import-x/order': [
        'error',
        {
          alphabetize: { order: 'asc' },
          named: true,
          'newlines-between': 'always'
        }
      ],

      // Check relative import paths use aliases
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./', '../'],
              message: "Please use '~/*' import alias instead."
            }
          ]
        }
      ],

      // JSDoc rules (override recommended config)
      ...jsdocRules,

      // Skip rules handled by TypeScript compiler
      'n/no-extraneous-require': 'off',
      'n/no-extraneous-import': 'off',
      'n/no-missing-require': 'off',
      'n/no-missing-import': 'off',

      // Prefer rules that are type aware
      'no-unused-vars': 'off',
      'no-use-before-define': 'off',
      '@typescript-eslint/no-unused-vars': ['error'],
      '@typescript-eslint/no-use-before-define': ['error', 'nofunc']
    }
  },

  // JS-specific override with recommended-typescript-flavor for JSDoc
  {
    files: ['**/*.{cjs,js,mjs}'],
    plugins: jsdocPlugin.configs['flat/recommended-typescript-flavor'].plugins,
    rules: {
      ...jsdocPlugin.configs['flat/recommended-typescript-flavor'].rules,
      // Re-apply our JSDoc overrides after the typescript-flavor rules
      ...jsdocRules
    }
  },

  // CJS override - allow require imports
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs'
    }
  },

  // ESM source type override
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      sourceType: 'module'
    },
    rules: {
      'import-x/extensions': [
        'error',
        'always',
        {
          ignorePackages: true,
          pattern: {
            cjs: 'always',
            js: 'always',
            mjs: 'always'
          }
        }
      ]
    }
  },

  // Jest override for test files
  {
    files: [
      '**/*.test.{cjs,js,mjs}',
      '**/__stubs__/*.{cjs,js,mjs}',
      '**/__mocks__/*.{cjs,js,mjs}'
    ],
    plugins: jest.configs['flat/recommended'].plugins,
    languageOptions: {
      globals: globals.jest
    },
    rules: {
      ...jest.configs['flat/recommended'].rules,
      ...jest.configs['flat/style'].rules,

      // Turn off warnings for jest.Expect 'any' types
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',

      // Allow Jest to assert on mocked unbound methods
      '@typescript-eslint/unbound-method': 'off',
      'jest/unbound-method': 'error'
    }
  },

  // Prettier must be last
  prettierConfig
]
