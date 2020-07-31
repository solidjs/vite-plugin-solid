import { UserConfig } from "vite";
const { solidPlugin } = require("../lib/plugin"); // This should work witrh import {} from '..'

const config: UserConfig = {
  root: "src",
  outDir: "dist",
  plugins: [solidPlugin()],
};

export default config;
