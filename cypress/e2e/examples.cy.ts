describe('Vite Plugin Solid Examples', () => {
  it('should increment counter correctly', () => {
    cy.visit('/')
    cy.contains('h1', /(?:Count|Counter): 0/)
    cy.contains('button', 'Increment').click()
    cy.contains('h1', /(?:Count|Counter): 1/)
  })
})