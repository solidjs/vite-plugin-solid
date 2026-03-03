import type { PluginObj, types as t } from '@babel/core';

export const LAZY_PLACEHOLDER_PREFIX = '__SOLID_LAZY_MODULE__:';

/**
 * Detects whether a CallExpression argument is `() => import("specifier")`
 * and returns the specifier string if so.
 */
function extractDynamicImportSpecifier(node: t.Node): string | null {
  if (node.type !== 'ArrowFunctionExpression' && node.type !== 'FunctionExpression') return null;

  let callExpr: t.CallExpression | null = null;
  if (node.body.type === 'CallExpression') {
    callExpr = node.body;
  } else if (
    node.body.type === 'BlockStatement' &&
    node.body.body.length === 1 &&
    node.body.body[0].type === 'ReturnStatement' &&
    node.body.body[0].argument?.type === 'CallExpression'
  ) {
    callExpr = node.body.body[0].argument;
  }
  if (!callExpr) return null;

  if (callExpr.callee.type !== 'Import') return null;
  if (callExpr.arguments.length !== 1) return null;

  const arg = callExpr.arguments[0];
  if (arg.type !== 'StringLiteral') return null;

  return arg.value;
}

/**
 * Babel plugin that detects `lazy(() => import("specifier"))` calls
 * and injects a placeholder as the second argument. The placeholder
 * is resolved to a real path by the Vite transform hook using this.resolve().
 */
export default function lazyModuleUrlPlugin(): PluginObj {
  return {
    name: 'solid-lazy-module-url',
    visitor: {
      CallExpression(nodePath, state) {
        if (!state.filename) return;
        const { node } = nodePath;

        if (node.callee.type !== 'Identifier' || node.callee.name !== 'lazy') return;

        const binding = nodePath.scope.getBinding('lazy');
        if (!binding || binding.kind !== 'module') return;
        const bindingPath = binding.path;
        if (
          bindingPath.type !== 'ImportSpecifier' ||
          bindingPath.parent.type !== 'ImportDeclaration'
        )
          return;
        const source = (bindingPath.parent as t.ImportDeclaration).source.value;
        if (source !== 'solid-js') return;

        if (node.arguments.length >= 2) return;
        if (node.arguments.length !== 1) return;

        const specifier = extractDynamicImportSpecifier(node.arguments[0] as t.Node);
        if (!specifier) return;

        node.arguments.push({
          type: 'StringLiteral',
          value: LAZY_PLACEHOLDER_PREFIX + specifier,
        } as t.StringLiteral);
      },
    },
  };
}
