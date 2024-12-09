import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      exclude: [
        'src/phase_1/workers/busFactorWorker.ts',
        'src/phase_1/workers/codeReviewWorker.ts',
        'src/phase_1/workers/correctnessWorker.ts',
        'src/phase_1/workers/dependencyWorker.ts',
        'src/phase_1/workers/licenseWorker.ts',
        'src/phase_1/workers/rampupWorker.ts',
        'src/phase_1/workers/responsivenessWorker.ts',
        'src/phase_1/workers/genericWorker.ts',
      ],
      include:[

        'src/**'

      ]
      
    }
  },
});
