import { solidPlugin } from '..';
import type { UserConfig } from 'vite';

const config: UserConfig = {
  plugins: [solidPlugin()],
};

export default config;
