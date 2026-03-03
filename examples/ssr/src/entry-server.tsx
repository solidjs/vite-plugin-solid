import { renderToStream, generateHydrationScript } from '@solidjs/web';
import App from './App';

export function render(manifest?: Record<string, any>) {
  const stream = renderToStream(() => <App />, { manifest });
  return { stream, hydrationScript: generateHydrationScript() };
}
