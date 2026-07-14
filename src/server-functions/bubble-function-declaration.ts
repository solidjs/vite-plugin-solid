// Hoisted from solid-start (packages/start/src/directives/bubble-function-declaration.ts).
import type * as babel from '@babel/core';
import { types as t } from '@babel/core';

/**
 * Rewrites a function declaration into a `const` function expression hoisted
 * to the top of its block, so declarations behave like the expression forms
 * the directive transform operates on (and exports keep working).
 */
export function bubbleFunctionDeclaration(path: babel.NodePath<t.FunctionDeclaration>): void {
  const decl = path.node;
  if (decl.id) {
    const block = (path.findParent((current) => current.isBlockStatement()) ||
      path.scope.getProgramParent().path) as babel.NodePath<t.BlockStatement>;

    if (path.parentPath.isExportNamedDeclaration()) {
      path.parentPath.replaceWith(
        t.exportNamedDeclaration(undefined, [t.exportSpecifier(decl.id, decl.id)]),
      );
    } else if (path.parentPath.isExportDefaultDeclaration()) {
      path.replaceWith(decl.id);
    } else {
      path.remove();
    }

    const [tmp] = block.unshiftContainer(
      'body',
      t.variableDeclaration('const', [
        t.variableDeclarator(
          decl.id,
          t.functionExpression(decl.id, decl.params, decl.body, decl.generator, decl.async),
        ),
      ]),
    );
    block.scope.registerDeclaration(tmp);
    tmp.skip();
  }
}
