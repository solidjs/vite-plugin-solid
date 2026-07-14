// Hoisted from solid-start (packages/start/src/directives/get-root-statement-path.ts).
import type * as babel from '@babel/core';
import { types as t } from '@babel/core';

export function getRootStatementPath(path: babel.NodePath): babel.NodePath {
  let current = path.parentPath;
  while (current) {
    const next = current.parentPath;
    if (next && t.isProgram(next.node)) {
      return current;
    }
    current = next;
  }
  return path;
}
