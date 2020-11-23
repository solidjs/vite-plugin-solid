import { Plugin } from "vite";
import {
  babel as babelRollup,
  RollupBabelInputPluginOptions,
} from "@rollup/plugin-babel";
import { transformFileAsync, TransformOptions } from "@babel/core";
import dd from "dedent";

export function solidPlugin(options?: SolidPluginOptions): Plugin {
  const babel = options?.babel ?? {};
  const { plugins, presets, ...babelOptions } = babel;

  // Merging plugins & presets if user add some more
  const babelPlugins = [...(plugins || [])];
  const babelPresets = [
    require("babel-preset-solid"),
    require("@babel/preset-typescript"),
    ...(presets || []),
  ];

  return {
    // Will be passed to rollup.rollup()
    rollupInputOptions: {
      plugins: [
        // Process Solid with @rollup/plugin-babel during build
        babelRollup({
          presets: babelPresets,
          plugins: babelPlugins,
          babelHelpers: "bundled",
          extensions: [".jsx", ".tsx"],
          ...(babelOptions || babel),
        } as RollupBabelInputPluginOptions),
      ],
    },
    configureServer: ({ resolver, app }) => {
      app.use(async (ctx, next) => {
        // Intercept the current request to the dev server and check if it's a jsx/tsx file
        if (/\.(t|j)sx$/.test(ctx.path)) {
          // Retrieve the requested file and transform it on the fly with babel
          const result = await transformFileAsync(
            resolver.requestToFile(ctx.path),
            {
              presets: babelPresets,
              plugins: babelPlugins,
              ast: false,
              sourceMaps: true,
              filename: ctx.path,
              sourceFileName: ctx.path,
              ...(babelOptions || babel),
            }
          );

          // If the transformation is successful, return it as as js content
          if (result) {
            ctx.type = "js";
            ctx.body = addHMR(result.code);
            ctx.map = result.map;
            return;
          }
        }

        // Otherwise let vite handle the file
        await next();
      });
    },
    enableRollupPluginVue: false,
  };
}

function addHMR(code: string) {
  if (!code.includes(`const dispose`)) return code;

  return dd`
    ${code}

    if (import.meta.hot) {
      import.meta.hot.accept();
      import.meta.hot.dispose(dispose);
    }
  `;
}

export default solidPlugin;

// TYPES
interface SolidPluginOptions {
  babel?: TransformOptions;
}
