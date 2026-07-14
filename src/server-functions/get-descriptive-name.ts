// Hoisted from solid-start (packages/start/src/directives/get-descriptive-name.ts).
import type { NodePath } from '@babel/core';

/**
 * Finds the closest binding-ish name for a function (variable, declaration or
 * method key) so development-mode server function IDs stay readable.
 */
export function getDescriptiveName(path: NodePath, defaultName: string): string {
  let current: NodePath | null = path;
  while (current) {
    switch (current.node.type) {
      case 'FunctionDeclaration':
      case 'FunctionExpression': {
        if (current.node.id) {
          return current.node.id.name;
        }
        break;
      }
      case 'VariableDeclarator': {
        if (current.node.id.type === 'Identifier') {
          return current.node.id.name;
        }
        break;
      }
      case 'ClassPrivateMethod':
      case 'ClassMethod':
      case 'ObjectMethod': {
        switch (current.node.key.type) {
          case 'Identifier':
            return current.node.key.name;
          case 'PrivateName':
            return current.node.key.id.name;
          default:
            break;
        }
        break;
      }
      default:
        break;
    }
    current = current.parentPath;
  }
  return defaultName;
}
