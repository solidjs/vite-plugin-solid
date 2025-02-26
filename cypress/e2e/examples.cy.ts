describe('Vite Plugin Solid Examples', () => {
  it('should increment counter correctly', () => {
    cy.visit('/')
    cy.get('h1').contains('Count: 0')
    cy.contains('button', 'Increment').click()
    cy.get('h1').contains('Count: 1')
  })
})