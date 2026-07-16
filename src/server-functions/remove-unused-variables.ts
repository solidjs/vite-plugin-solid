// Hoisted from solid-start (packages/start/src/directives/remove-unused-variables.ts).
import type * as babel from '@babel/core';
import { types as t } from '@babel/core';
import { isPathValid } from './paths.js';

export interface ShakeContext {
  /**
   * Names of bindings referenced from the subtrees the client rewrite
   * removed or replaced (the "orphan candidates"). Only these bindings —
   * plus bindings that transitively become dead because a removed
   * declaration referenced them — may be shaken. Code that was already dead
   * before the transform must survive it untouched.
   */
  orphans: Set<string>;
  env: 'production' | 'development';
}

export const DIRECT_EVAL_WARNING =
  'server-functions: skipping dead-code elimination for this module because it contains a direct eval() call';

/**
 * Records every identifier in a reference position within `path`'s subtree.
 * Used to seed the orphan-candidate set from replaced server-function bodies
 * and to cascade it through subtrees the shake removes.
 */
export function collectReferencedNames(path: babel.NodePath, names: Set<string>): void {
  path.traverse({
    Identifier(child) {
      if (child.isReferencedIdentifier()) {
        names.add(child.node.name);
      }
    },
    JSXIdentifier(child) {
      if (child.isReferencedIdentifier()) {
        names.add(child.node.name);
      }
    },
  });
}

/**
 * A direct `eval(...)` call (identifier callee, no local binding — modules
 * are always strict so `eval` can never be rebound, but the binding check
 * keeps the intent explicit) makes reference counts unreliable: eval'd code
 * can read any binding in scope. Property accesses (`window.eval`) and
 * indirect calls (`(0, eval)(...)`) don't have that power.
 */
function hasDirectEval(program: babel.NodePath<t.Program>): boolean {
  let found = false;
  program.traverse({
    CallExpression(path) {
      const callee = path.node.callee;
      if (t.isIdentifier(callee) && callee.name === 'eval' && !path.scope.getBinding('eval')) {
        found = true;
        path.stop();
      }
    },
  });
  return found;
}

function isPatternDeclarator(path: babel.NodePath): path is babel.NodePath<t.VariableDeclarator> {
  if (!isPathValid(path, t.isVariableDeclarator)) {
    return false;
  }
  const id = path.node.id;
  return t.isObjectPattern(id) || t.isArrayPattern(id);
}

/**
 * Removes the pattern element binding `identifier` from its declarator,
 * cascading upward: defaults and computed keys go with their element,
 * emptied nested patterns collapse, and when the declarator has no bindings
 * left the whole declarator is dropped (initializer included, consistent
 * with the aggressive-removal semantics). Array pattern elements become
 * holes when later elements remain, otherwise the tail is truncated.
 */
function removePatternElement(target: babel.NodePath, candidates: Set<string>): void {
  // Climb to the removable element: defaults, rests, and property wrappers
  // travel with the binding they carry.
  let current = target;
  for (;;) {
    const parent = current.parentPath;
    if (isPathValid(parent, t.isAssignmentPattern) && current.key === 'left') {
      current = parent;
      continue;
    }
    if (isPathValid(parent, t.isRestElement)) {
      current = parent;
      continue;
    }
    if (isPathValid(parent, t.isObjectProperty) && current.key === 'value') {
      current = parent;
      continue;
    }
    break;
  }

  const parent = current.parentPath;

  if (isPathValid(parent, t.isVariableDeclarator)) {
    // The declarator's entire pattern emptied: the initializer is orphaned
    // with it, so its references cascade into the candidate set.
    collectReferencedNames(parent, candidates);
    parent.remove();
    return;
  }

  collectReferencedNames(current, candidates);

  if (isPathValid(parent, t.isObjectPattern)) {
    current.remove();
    if (parent.node.properties.length === 0) {
      removePatternElement(parent, candidates);
    }
    return;
  }

  if (isPathValid(parent, t.isArrayPattern)) {
    const elements: (t.Node | null)[] = parent.node.elements;
    elements[current.key as number] = null;
    while (elements.length > 0 && elements[elements.length - 1] === null) {
      elements.pop();
    }
    if (elements.length === 0) {
      removePatternElement(parent, candidates);
    }
  }
}

/**
 * Dead-code elimination after directive extraction: on the client, function
 * bodies were replaced by references, so anything only they used (including
 * now-unneeded imports) must go — that is the server-code-leak guarantee.
 * The shake is scoped to the orphan-candidate set so bindings that were
 * already unreferenced before the transform survive.
 */
export function removeUnusedVariables(program: babel.NodePath<t.Program>, ctx: ShakeContext): void {
  const candidates = ctx.orphans;
  if (candidates.size === 0) {
    return;
  }
  if (hasDirectEval(program)) {
    if (ctx.env === 'development') {
      console.warn(DIRECT_EVAL_WARNING);
    }
    return;
  }

  // Simple but slow: repeat passes until a pass removes nothing.
  let dirty = true;

  while (dirty) {
    dirty = false;
    // Pattern surgery is deferred to the end of the pass so the traversal
    // never walks nodes it is mutating.
    const patternRemovals: {
      declarator: babel.NodePath<t.VariableDeclarator>;
      identifier: t.Identifier;
    }[] = [];
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
              if (
                binding.references === 0 &&
                !binding.path.removed &&
                candidates.has(path.node.name)
              ) {
                const parent = binding.path.parentPath;
                if (isPathValid(parent, t.isImportDeclaration)) {
                  if (parent.node.specifiers.length === 1) {
                    parent.remove();
                  } else {
                    binding.path.remove();
                  }
                  dirty = true;
                } else if (isPathValid(binding.path, t.isCatchClause)) {
                  // `catch (error)` clauses are excluded from removal.
                } else if (isPatternDeclarator(binding.path)) {
                  patternRemovals.push({
                    declarator: binding.path,
                    identifier: binding.identifier,
                  });
                } else if (isPathValid(binding.path, t.isVariableDeclarator)) {
                  collectReferencedNames(binding.path, candidates);
                  binding.path.remove();
                  dirty = true;
                } else if (
                  isPathValid(binding.path, t.isFunctionDeclaration) ||
                  isPathValid(binding.path, t.isClassDeclaration)
                ) {
                  collectReferencedNames(binding.path, candidates);
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
    for (const { declarator, identifier } of patternRemovals) {
      if (declarator.removed) {
        continue;
      }
      // Locate the live path of the binding identifier; an earlier surgery
      // in the same pass may have already detached it. Shorthand properties
      // can reuse one node for key and value, so key positions are skipped.
      let identifierPath: babel.NodePath | null = null;
      declarator.traverse({
        Identifier(child) {
          if (
            child.node === identifier &&
            !(isPathValid(child.parentPath, t.isObjectProperty) && child.key === 'key')
          ) {
            identifierPath = child;
            child.stop();
          }
        },
      });
      if (identifierPath) {
        removePatternElement(identifierPath, candidates);
        dirty = true;
      }
    }
    program.scope.crawl();
  }
}
