import { defineConfig } from 'cypress'
import vitePreprocessor from 'cypress-vite'

export default defineConfig({
  viewportHeight: 800,
  viewportWidth: 1200,
  e2e: {
    baseUrl: 'http://localhost:4173',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    screenshotOnRunFailure: false,
    trashAssetsBeforeRuns: true,
    screenshotsFolder: './cypress/snapshots/actual',
    viewportHeight: 800,
    defaultBrowser: 'chrome',
    viewportWidth: 1200,
    setupNodeEvents(on) {
      on('file:preprocessor', vitePreprocessor())

      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.name === 'chrome' && browser.isHeadless) {
          // fullPage screenshot size is 1400x1200 on non-retina screens
          // and 2800x2400 on retina screens
          launchOptions.args.push('--window-size=1200,800')

          // force screen to be non-retina (1200x800 size)
          launchOptions.args.push('--force-device-scale-factor=')

          // force screen to be retina (2400x1600 size)
          // launchOptions.args.push('--force-device-scale-factor=2')
        }

        if (browser.name === 'electron' && browser.isHeadless) {
          // fullPage screenshot size is 1200x800
          launchOptions.preferences.width = 1200
          launchOptions.preferences.height = 800
        }

        if (browser.name === 'firefox' && browser.isHeadless) {
          // menubars take up height on the screen
          // so fullPage screenshot size is 1200x726
          launchOptions.args.push('--width=1200')
          launchOptions.args.push('--height=800')
        }

        return launchOptions
      })

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
