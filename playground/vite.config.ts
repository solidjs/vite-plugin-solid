import { UserConfig } from "vite";
const { solidPlugin } = require("../lib/plugin"); // This should work witrh import {} from '..'

const config: UserConfig = {
  root: "src",
  outDir: "dist",
  plugins: [solidPlugin()],
  // Vite and Esbuild being opinionated about how to manage JSX,
  // you need to disable it to prevent extra stuff going in your bundle
  // Luckily, vite is still quite fast even skipping Esbuild
  enableEsbuild: false,
};

export default config;
