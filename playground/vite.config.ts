import { UserConfig } from "vite";
import { solidPlugin } from "../lib/plugin";

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
