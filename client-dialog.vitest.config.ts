import { mergeConfig } from 'vitest/config'
import config from './vitest.config'

export default mergeConfig(config, {
  test: {
    include: [
      'src/components/time-tracker/dashboard/hooks/tracker-notifications.test.tsx',
      'src/components/time-tracker/dashboard/EntriesFiltersDialog.test.tsx',
      'src/components/time-tracker/catalogs/ClientDetailsDialog.test.tsx',
      'src/components/time-tracker/catalogs/ProjectDetailScreen.test.tsx',
    ],
  },
})
