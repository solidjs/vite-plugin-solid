import { renderToStream } from '@solidjs/web';
import manifest from 'virtual:solid-manifest';
import App from './App';

export function render(url: string) {
  return renderToStream(() => <App url={url} />, { manifest });
}
