//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    files: ['src/lib/server/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
  {
    // Vendored as-is from the mapcn registry (maplibre-gl wrapper). Style
    // opinions don't apply to upstream code; behavior fixes go upstream.
    files: ['src/components/ui/map.tsx'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/naming-convention': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      'node_modules/**',
      '.vercel/**',
      '.output/**',
      '.nitro/**',
      '.tanstack/**',
      'dist/**',
      'build/**',
      'src/generated/**',
      'src/routeTree.gen.ts',
      'prisma/migrations/**',
    ],
  },
]
