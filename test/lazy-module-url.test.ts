import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeLazyModulePath } from '../src/lazy-module-url.ts';

// Regression test for the Windows-only bug where `path.relative` returns
// backslash separators that, once embedded as the 2nd arg to `lazy()`, are
// invalid JS escape sequences (`"src\components\App.tsx"`) and break the parse.
test('normalizeLazyModulePath converts Windows backslashes to forward slashes', () => {
  assert.equal(normalizeLazyModulePath('src\\components\\App.tsx'), 'src/components/App.tsx');
});

test('normalizeLazyModulePath leaves POSIX paths untouched', () => {
  assert.equal(normalizeLazyModulePath('src/components/App.tsx'), 'src/components/App.tsx');
});

test('normalizeLazyModulePath handles mixed separators', () => {
  assert.equal(normalizeLazyModulePath('src\\ui/buttons\\Base.tsx'), 'src/ui/buttons/Base.tsx');
});

test('normalizeLazyModulePath leaves a bare filename untouched', () => {
  assert.equal(normalizeLazyModulePath('App.tsx'), 'App.tsx');
});
