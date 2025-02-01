Cypress.Commands.add('compareSnapshot', (name: string) => {
  const updateSnapshots = Cypress.env('updateSnapshots');
  const snapshotsDir = 'cypress/snapshots';
  
  cy.viewport(1200, 800);
  cy.screenshot(name, { 
    capture: 'viewport',
    overwrite: updateSnapshots 
  }).then(() => {
    if (!updateSnapshots) {
      cy.readFile(`${snapshotsDir}/base/examples.cy.ts/${name}.png`, 'base64').then((baseImage) => {
        cy.readFile(`${snapshotsDir}/actual/examples.cy.ts/${name}.png`, 'base64').then((actualImage) => {
          expect(actualImage).to.equal(baseImage);
        });
      });
    }
  });
});

declare namespace Cypress {
  interface Chainable {
    compareSnapshot(name: string): Chainable<void>
  }
}