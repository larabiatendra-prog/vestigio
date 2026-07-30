import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/', 'dist/', 'out/', 'build/', 'coverage/'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Scripts sueltos de Node (verificadores, utilidades de build).
    files: ['**/scripts/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
    rules: {
      'no-console': 'off',
    },
  },
);
