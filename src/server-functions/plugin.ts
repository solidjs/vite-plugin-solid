// Hoisted from solid-start (packages/start/src/directives/plugin.ts).
//
// The directive transform. Two forms are supported:
//
// - Function-level `"use server"` (first statement of a function body): the
//   function is registered on the server (`register`) and replaced on both
//   sides by a callable reference (`create`) addressed by a build-stable ID.
// - Module-level `"use server"` (first statement of the module): every
//   exported function becomes a server function. The client build's module
//   body is replaced entirely by reference exports, so server-only code never
//   reaches the browser.
import type * as babel from '@babel/core';
import { types as t } from '@babel/core';
// `Binding` isn't re-exported by @types/babel__core and @babel/traverse isn't
// a direct dependency, so derive it from the scope type instead.
type Binding = NonNullable<ReturnType<babel.NodePath['scope']['getBinding']>>;
import { bubbleFunctionDeclaration } from './bubble-function-declaration.js';
import { generateUniqueName } from './generate-unique-name.js';
import { getDescriptiveName } from './get-descriptive-name.js';
import { getImportIdentifier } from './get-import-identifier.js';
import { getRootStatementPath } from './get-root-statement-path.js';
import { isStatementTopLevel } from './is-statement-top-level.js';
import { isPathValid, unwrapPath } from './paths.js';
import { collectReferencedNames, removeUnusedVariables } from './remove-unused-variables.js';
import type { ImportDefinition } from './types.js';

export interface StateContext {
  env: 'production' | 'development';
  mode: 'server' | 'client';
  directive: string;
  hash: string;
  count: number;
  imports: Map<string, t.Identifier>;
  valid: boolean;
  /**
   * Bindings referenced from subtrees the client rewrite replaced — the only
   * bindings the post-transform shake is allowed to remove (plus cascades).
   */
  orphans: Set<string>;

  definitions: {
    register: ImportDefinition;
    create: ImportDefinition;
  };
}

type ValidFunction = t.ArrowFunctionExpression | t.FunctionExpression;

function isValidFunction(node: t.Node): node is ValidFunction {
  return t.isArrowFunctionExpression(node) || t.isFunctionExpression(node);
}

function isDirectiveValid(ctx: StateContext, directives: t.Directive[]) {
  for (let i = 0, len = directives.length; i < len; i++) {
    if (directives[i]!.value.value === ctx.directive) {
      return true;
    }
  }
  return false;
}

function cleanDirectives(path: babel.NodePath<t.BlockStatement | t.Program>, target: string): void {
  const newDirectives: t.Directive[] = [];
  for (let i = 0, len = path.node.directives.length; i < len; i++) {
    const current = path.node.directives[i]!;
    if (current.value.value !== target) {
      newDirectives.push(current);
    }
  }
  path.node.directives = newDirectives;
}

function cleanFunctionDirectives(
  ctx: StateContext,
  path: babel.NodePath<t.FunctionDeclaration | ValidFunction>,
) {
  const body = path.get('body');

  if (isPathValid(body, t.isBlockStatement)) {
    cleanDirectives(body, ctx.directive);
  }
}

function isFunctionDirectiveValid(
  ctx: StateContext,
  path: babel.NodePath<t.FunctionDeclaration | ValidFunction>,
) {
  const body = path.get('body');

  if (isPathValid(body, t.isBlockStatement)) {
    return isDirectiveValid(ctx, body.node.directives);
  }

  return false;
}

function createID(ctx: StateContext, name: string) {
  const base = `${ctx.hash}-${ctx.count++}`;
  if (ctx.env === 'development') {
    return `${base}-${name}`;
  }
  return base;
}

function transformFunction(
  ctx: StateContext,
  path: babel.NodePath<ValidFunction>,
  direct: boolean,
) {
  if (!direct) {
    if (!isFunctionDirectiveValid(ctx, path)) {
      return;
    }
    cleanFunctionDirectives(ctx, path);
  }
  // First, get root statement
  const rootStatement = getRootStatementPath(path);

  // Create a unique ID for the function
  const fnID = createID(ctx, getDescriptiveName(path, 'anonymous'));

  if (ctx.mode === 'server') {
    // Create a "source" function on the root-level
    const sourceReference = t.callExpression(
      getImportIdentifier(ctx.imports, path, ctx.definitions.register),
      [t.stringLiteral(fnID), path.node],
    );

    const sourceID = generateUniqueName(path, 'serverFunction');

    rootStatement.insertBefore(
      t.variableDeclaration('const', [t.variableDeclarator(sourceID, sourceReference)]),
    );

    // Replace the server function with a callable built from the reference
    path.replaceWith(
      t.callExpression(getImportIdentifier(ctx.imports, path, ctx.definitions.create), [sourceID]),
    );
  } else {
    // The function subtree is about to be discarded: whatever it referenced
    // may now be orphaned, and only those bindings are eligible for the
    // post-transform shake.
    collectReferencedNames(path, ctx.orphans);
    // Otherwise, build the callable from the function's ID
    path.replaceWith(
      t.callExpression(getImportIdentifier(ctx.imports, path, ctx.definitions.create), [
        t.stringLiteral(fnID),
      ]),
    );
  }

  path.scope.crawl();
}

function traceBinding(path: babel.NodePath, name: string): Binding | undefined {
  const current = path.scope.getBinding(name);
  if (!current) {
    return undefined;
  }
  switch (current.kind) {
    case 'const':
    case 'let':
    case 'var': {
      if (isPathValid(current.path, t.isVariableDeclarator)) {
        // Check if left is identifier
        const left = unwrapPath(current.path.get('id'), t.isIdentifier);
        if (left) {
          const right = unwrapPath(current.path.get('init'), t.isIdentifier);
          if (right) {
            return traceBinding(path, right.node.name);
          }

          // Only valid for functions
          const func = unwrapPath(current.path.get('init'), isValidFunction);
          if (func) {
            return current;
          }
        }
      }
      return undefined;
    }
    case 'hoisted':
    case 'local':
    case 'module':
    case 'param':
    case 'unknown':
      return undefined;
  }
}

function transformBindingForServer(ctx: StateContext, binding: Binding) {
  if (isPathValid(binding.path, t.isVariableDeclarator)) {
    const right = unwrapPath(binding.path.get('init'), isValidFunction);
    if (right) {
      transformFunction(ctx, right, true);
    }
  }
}

interface State extends babel.PluginPass {
  opts: StateContext;
}

function transformModuleLevelDirective(ctx: StateContext, program: babel.NodePath<t.Program>) {
  cleanDirectives(program, ctx.directive);
  program.traverse({
    FunctionDeclaration(child) {
      // We only need to move top-level functions
      if (isStatementTopLevel(child)) {
        bubbleFunctionDeclaration(child);
      }
    },
  });
  program.scope.crawl();
  if (ctx.mode === 'server') {
    // Trace bindings
    const bindings = new Set<Binding>();

    program.traverse({
      ExportDefaultDeclaration(path) {
        const id = unwrapPath(path.get('declaration'), t.isIdentifier);
        if (id) {
          const binding = traceBinding(path, id.node.name);
          if (binding) {
            bindings.add(binding);
          }
        }
      },
      ExportNamedDeclaration(path) {
        if (path.node.source || path.node.exportKind === 'type') {
          return;
        }
        for (const specifier of path.get('specifiers')) {
          if (isPathValid(specifier, t.isExportSpecifier)) {
            const binding = traceBinding(specifier, specifier.node.local.name);

            if (binding) {
              bindings.add(binding);
            }
          }
        }
        const declarations = path.get('declaration');

        if (isPathValid(declarations, t.isVariableDeclaration)) {
          for (const declaration of declarations.get('declarations')) {
            // Check if left is identifier
            const left = unwrapPath(declaration.get('id'), t.isIdentifier);
            if (left) {
              const binding = traceBinding(left, left.node.name);
              if (binding) {
                bindings.add(binding);
              }
            }
          }
        }
      },
    });

    for (const binding of bindings) {
      transformBindingForServer(ctx, binding);
    }
  } else {
    // Trace bindings
    const uniqueBindings = new Set<Binding>();
    const exportedBindings = new Map<string, Binding>();

    program.traverse({
      ExportDefaultDeclaration(path) {
        const id = unwrapPath(path.get('declaration'), t.isIdentifier);
        if (id) {
          const binding = traceBinding(path, id.node.name);
          if (binding) {
            uniqueBindings.add(binding);
            exportedBindings.set('default', binding);
          }
        }
      },
      ExportNamedDeclaration(path) {
        if (path.node.source || path.node.exportKind === 'type') {
          return;
        }
        for (const specifier of path.get('specifiers')) {
          if (isPathValid(specifier, t.isExportSpecifier)) {
            const binding = traceBinding(specifier, specifier.node.local.name);

            if (binding) {
              const key = t.isIdentifier(specifier.node.exported)
                ? specifier.node.exported.name
                : specifier.node.exported.value;
              uniqueBindings.add(binding);
              exportedBindings.set(key, binding);
            }
          }
        }

        const declarations = path.get('declaration');

        if (isPathValid(declarations, t.isVariableDeclaration)) {
          for (const declaration of declarations.get('declarations')) {
            // Check if left is identifier
            const left = unwrapPath(declaration.get('id'), t.isIdentifier);
            if (left) {
              const binding = traceBinding(left, left.node.name);
              if (binding) {
                uniqueBindings.add(binding);
                exportedBindings.set(left.node.name, binding);
              }
            }
          }
        }
      },
    });

    // generate ids for each unique binding
    const sourceIDs = new Map<Binding, string>();
    for (const binding of uniqueBindings) {
      if (isPathValid(binding.path, t.isVariableDeclarator)) {
        const init = unwrapPath(binding.path.get('init'), isValidFunction);
        if (init) {
          sourceIDs.set(binding, createID(ctx, getDescriptiveName(init, 'anonymous')));
        }
      }
    }

    // The client build keeps none of the module: every export becomes a
    // reference and everything else (server-only imports, helpers, secrets)
    // is dropped wholesale.
    program.node.body = [];

    const declarations: t.VariableDeclarator[] = [];
    const specifiers: t.ExportSpecifier[] = [];

    const declarationMap = new Map<Binding, t.Identifier>();

    // Declare all client functions
    for (const [exported, binding] of exportedBindings) {
      let currentIdentifier = declarationMap.get(binding);
      if (!currentIdentifier) {
        currentIdentifier = generateUniqueName(program, 'fn');

        const fnID = sourceIDs.get(binding);

        if (fnID) {
          declarations.push(
            t.variableDeclarator(
              currentIdentifier,
              t.callExpression(getImportIdentifier(ctx.imports, program, ctx.definitions.create), [
                t.stringLiteral(fnID),
              ]),
            ),
          );

          declarationMap.set(binding, currentIdentifier);
        }
      }

      if (currentIdentifier) {
        specifiers.push(t.exportSpecifier(currentIdentifier, t.stringLiteral(exported)));
      }
    }

    const body: t.Statement[] = [];

    if (declarations.length > 0) {
      body.push(t.variableDeclaration('const', declarations));
    }
    if (specifiers.length > 0) {
      body.push(t.exportNamedDeclaration(null, specifiers, null));
    }

    program.pushContainer('body', body);
  }
}

export function directivesPlugin(): babel.PluginObj<State> {
  return {
    name: 'solid:server-functions',
    visitor: {
      Program(program, ctx) {
        const isModuleLevel = isDirectiveValid(ctx.opts, program.node.directives);
        if (isModuleLevel) {
          transformModuleLevelDirective(ctx.opts, program);
          ctx.opts.valid = true;
        } else {
          // First, bubble up function declarations
          program.traverse({
            FunctionDeclaration(child) {
              bubbleFunctionDeclaration(child);
            },
          });
          program.scope.crawl();
          // Now we transform each function
          program.traverse({
            ArrowFunctionExpression(path) {
              transformFunction(ctx.opts, path, false);
            },
            FunctionExpression(path) {
              transformFunction(ctx.opts, path, false);
            },
          });
          program.scope.crawl();

          if (ctx.opts.count > 0) {
            ctx.opts.valid = true;
            removeUnusedVariables(program, {
              orphans: ctx.opts.orphans,
              env: ctx.opts.env,
            });
          }
        }
      },
    },
  };
}
