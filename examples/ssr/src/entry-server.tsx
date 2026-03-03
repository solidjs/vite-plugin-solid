import { renderToStream } from '@solidjs/web';
import App from './App';

export function render(manifest?: Record<string, any>) {
  return renderToStream(() => <App />, { manifest });
}
