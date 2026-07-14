// Hoisted from solid-start (packages/start/src/directives/get-import-identifier.ts).
import type * as babel from '@babel/core';
import { types as t } from '@babel/core';
import { generateUniqueName } from './generate-unique-name.js';
import type { ImportDefinition } from './types.js';

/**
 * Returns the local identifier for a runtime import, injecting the import
 * declaration on first use (deduplicated through the `imports` map).
 */
export function getImportIdentifier(
  imports: Map<string, t.Identifier>,
  path: babel.NodePath,
  registration: ImportDefinition,
): t.Identifier {
  const name = registration.kind === 'named' ? registration.name : 'default';
  const target = `${registration.source}[${name}]`;
  const current = imports.get(target);
  if (current) {
    return current;
  }
  const programParent = path.scope.getProgramParent();
  const uid = generateUniqueName(programParent.path, name);
  programParent.registerDeclaration(
    (programParent.path as babel.NodePath<t.Program>).unshiftContainer(
      'body',
      t.importDeclaration(
        [
          registration.kind === 'named'
            ? t.importSpecifier(uid, t.identifier(registration.name))
            : t.importDefaultSpecifier(uid),
        ],
        t.stringLiteral(registration.source),
      ),
    )[0],
  );
  imports.set(target, uid);
  return uid;
}
