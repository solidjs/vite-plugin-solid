import '../support/e2e'

describe('Vite Plugin Solid Examples', () => {
  it(`should match snapshot for current example`, () => {
    const example = Cypress.env('example');
    if (!example) {
      throw new Error('No example specified');
    }

    cy.visit('/')
    cy.wait(1000)

    cy.contains('button', 'Increment').click()

    cy.compareSnapshot(`${example}-snapshot`)

    
  })
})
