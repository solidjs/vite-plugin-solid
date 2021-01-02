import { Plugin } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import solid from 'babel-preset-solid';
import typescript from '@babel/preset-typescript';
import { transformAsync, transformFileAsync, TransformOptions } from '@babel/core';

type Obj = Record<string, any>;

function readPkg(name: string) {
  try {
    const paths = name === '.' ? ['package.json'] : ['node_modules', name, 'package.json'];
    const pkgJsonPath = resolve(process.cwd(), ...paths);

    const pkgJsonContent = readFileSync(pkgJsonPath, { encoding: 'utf-8' });

    return JSON.parse(pkgJsonContent);
  } catch {
    return { name };
  }
}

// https://gist.github.com/ahtcx/0cd94e62691f539160b32ecda18af3d6#gistcomment-3571894
function deepMerge(target: Obj, source: Obj) {
  const isArray = Array.isArray;
  const isObject = (obj: unknown): obj is Obj => obj && typeof obj === 'object';

  const cloneTarget = { ...target };

  if (!isObject(cloneTarget) || !isObject(source)) return source;

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = cloneTarget[key];

    if (isArray(targetValue) && isArray(sourceValue)) {
      cloneTarget[key] = targetValue.map((x, i) =>
        sourceValue.length <= i ? x : deepMerge(x, sourceValue[i]),
      );

      if (sourceValue.length > targetValue.length) {
        cloneTarget[key] = [...cloneTarget[key], ...sourceValue.slice(targetValue.length)];
      }
    } else if (isObject(targetValue) && isObject(sourceValue)) {
      cloneTarget[key] = deepMerge({ ...targetValue }, sourceValue);
    } else {
      cloneTarget[key] = sourceValue;
    }
  }

  return cloneTarget;
}

function isPkgExportingJsx(pkg: Obj) {
  const JSX_RE = /(j|t)sx$/;
  return Object.values(pkg).some((value) => JSX_RE.test(String(value)));
}

export function solidPlugin(): Plugin {
  const extensions = ['.tsx', '.jsx'];

  const opts = (filename: string): TransformOptions => ({
    filename,
    sourceMaps: 'inline',
    presets: [typescript, solid],
  });

  return {
    name: 'solid',
    enforce: 'pre',

    config(config) {
      const pkg = readPkg('.');

      const exclude = Object.keys(pkg.dependencies).reduce((modulesToExclude, pkgName) => {
        const pkgJson = readPkg(pkgName);
        const exportJsx = isPkgExportingJsx(pkgJson);

        return [...modulesToExclude, ...(exportJsx ? [pkgJson.name] : [])];
      }, []);

      return deepMerge(config, { optimizeDeps: { exclude } });
    },

    load(id) {
      if (!id.includes('node_modules')) return null;
      if (!extensions.some((ext) => id.includes(ext))) return null;

      return 'jsx:' + id.replace(/\?.+/g, '');
    },

    async transform(source, id) {
      if (!extensions.some((ext) => id.includes(ext))) return null;
      const isPath = source.startsWith('jsx:');

      const { code } = isPath
        ? await transformFileAsync(source.replace('jsx:', ''), opts(source))
        : await transformAsync(source, opts(id));

      return { code };
    },
  };
}
