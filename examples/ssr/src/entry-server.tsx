import { renderToStream, generateHydrationScript } from '@solidjs/web';
import manifest from 'virtual:solid-manifest';
import App from './App';

export function render() {
  const stream = renderToStream(() => <App />, { manifest });
  return { stream, hydrationScript: generateHydrationScript() };
}
