import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/out/**',
      '**/release/**',
      '**/coverage/**',
      '**/reports/**',
      '**/.stryker-tmp/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Scripts d'outillage exécutés par Node.
    files: ['**/scripts/**/*.mjs'],
    languageOptions: {
      globals: { Buffer: 'readonly', URL: 'readonly', console: 'readonly', process: 'readonly' },
    },
  },
  {
    // Le domaine ne dépend de rien d'extérieur : seuls les imports relatifs sont permis.
    files: ['packages/domain/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?![.]{1,2}/)',
              message: 'Le domaine ne doit dépendre d’aucune bibliothèque ni d’aucun module Node.',
            },
          ],
        },
      ],
    },
  },
  {
    // La couche application ne connaît que le domaine ; la technique passe par les ports.
    files: ['packages/application/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?![.]{1,2}/|@findandfill/domain$)',
              message: 'L’application ne dépend que du domaine et de ses propres ports.',
            },
          ],
        },
      ],
    },
  },
);
