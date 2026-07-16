import { renderToStream } from '@solidjs/web';
import manifest from 'virtual:solid-manifest';
import App from './App';

export function render() {
  return renderToStream(() => <App />, { manifest });
}

// The entire production server-function mount: the virtual handler imports
// every module containing server functions (so registrations survive
// tree-shaking), scopes each request with provideRequestEvent, and
// configures the endpoint. Dev never uses this export — the plugin's dev
// middleware inside vite.middlewares handles the endpoint end to end.
export { handleServerFunctionRequest } from 'virtual:solid-server-function-handler';
