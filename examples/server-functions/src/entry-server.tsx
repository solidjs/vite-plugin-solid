import { renderToStream } from '@solidjs/web';
import { handleServerFunctionRequest } from '@solidjs/web/server-functions';
import { provideRequestEvent } from '@solidjs/web/storage';
import manifest from 'virtual:solid-manifest';
// Side-effect import: pulls in every module containing server functions so
// their registrations exist before any /_server request is dispatched (e.g.
// functions in modules the SSR render itself never imports).
import 'virtual:solid-server-function-manifest';
import App from './App';

export function render() {
  return renderToStream(() => <App />, { manifest });
}

/**
 * HTTP endpoint for server functions: the core runtime handles id lookup,
 * argument decoding, event scoping, and result encoding — including the
 * respond()/redirect() helpers from @solidjs/web. provideRequestEvent
 * establishes the AsyncLocalStorage scope getRequestEvent() reads inside
 * dispatched functions.
 */
export function handleServerFunction(request: Request): Promise<Response> {
  return handleServerFunctionRequest(request, { provideEvent: provideRequestEvent });
}
