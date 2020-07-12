import { Plugin } from "vite";
import { babel as babelRollup } from "@rollup/plugin-babel";
import { transformFileAsync, TransformOptions } from "@babel/core";

export function solidPlugin(options?: SolidPluginOptions): Plugin {
  const babel = options?.babel ?? {};
  const { plugins, presets, ...babelOptions } = babel;

  // Merging plugins & presets if user add some more
  const babelPlugins = [...(plugins || [])];
  const babelPresets = [
    "babel-preset-solid",
    "@babel/preset-typescript",
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
          extensions: [".js", ".ts", ".jsx", ".tsx"],
          ...(babelOptions || babel),
        }),
      ],
    },
    configureServer: ({ resolver, app }) => {
      app.use(async (ctx, next) => {
        // Intercept the current request to the dev server and check if it's a js/ts/jsx/tsx file
        if (/\.(t|j)s(x)?$/.test(ctx.path)) {
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
            ctx.body = result.code;
            ctx.map = result.map;
            return;
          }
        }

        // Otherwise let vite handle the file
        await next();
      });
    },
  };
}

export default solidPlugin;

// TYPES
interface SolidPluginOptions {
  babel?: TransformOptions;
}
