// Hoisted from solid-start (packages/start/src/directives/remove-unused-variables.ts).
import type * as babel from '@babel/core';
import { types as t } from '@babel/core';
import { isPathValid } from './paths.js';

function isInvalidForRemoval(path: babel.NodePath) {
  if (isPathValid(path, t.isCatchClause)) {
    // This case is for `catch (error)` blocks
    return true;
  }

  // This one is for destructured variables
  let target = path;
  if (isPathValid(path, t.isVariableDeclarator)) {
    target = path.get('id') as babel.NodePath;
  }
  return isPathValid(target, t.isObjectPattern) || isPathValid(target, t.isArrayPattern);
}

/**
 * Dead-code elimination after directive extraction: on the client, function
 * bodies were replaced by references, so anything only they used (including
 * now-unneeded imports) must go — that is the server-code-leak guarantee.
 */
export function removeUnusedVariables(program: babel.NodePath<t.Program>) {
  // Simple but slow: repeat passes until a pass removes nothing.
  let dirty = true;

  while (dirty) {
    dirty = false;
    program.traverse({
      BindingIdentifier(path) {
        const binding = path.scope.getBinding(path.node.name);

        if (binding) {
          switch (binding.kind) {
            case 'const':
            case 'let':
            case 'var':
            case 'hoisted':
            case 'module':
              if (binding.references === 0 && !binding.path.removed) {
                const parent = binding.path.parentPath;
                if (isPathValid(parent, t.isImportDeclaration)) {
                  if (parent.node.specifiers.length === 1) {
                    parent.remove();
                  } else {
                    binding.path.remove();
                  }
                  dirty = true;
                } else if (!isInvalidForRemoval(binding.path)) {
                  binding.path.remove();
                  dirty = true;
                }
              }
              break;
            case 'local':
            case 'param':
            case 'unknown':
              break;
          }
        }
      },
      VariableDeclaration(path) {
        if (path.node.declarations.length === 0) {
          path.remove();
        }
      },
    });
    program.scope.crawl();
  }
}
