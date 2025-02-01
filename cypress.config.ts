import { defineConfig } from 'cypress'
import vitePreprocessor from 'cypress-vite'

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4173',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    screenshotOnRunFailure: false,
    trashAssetsBeforeRuns: true,
    screenshotsFolder: './cypress/snapshots/actual',
    viewportHeight: 800,
    viewportWidth: 1200,
    setupNodeEvents(on) {
      on('file:preprocessor', vitePreprocessor())
    },
    env: {
      example: '',
      visualRegressionType: 'regression',
      visualRegressionBaseDirectory: 'cypress/snapshot/base',
      visualRegressionDiffDirectory: 'cypress/snapshot/diff',
      visualRegressionGenerateDiff: 'always',
      visualRegressionFailSilently: true
    }
  },
})
