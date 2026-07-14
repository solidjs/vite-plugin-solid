import { renderToStream } from '@solidjs/web';
import { provideRequestEvent } from '@solidjs/web/storage';
import manifest from 'virtual:solid-manifest';
// Side-effect import: pulls in every module containing server functions so
// their registrations exist before any /_server request is dispatched (e.g.
// functions in modules the SSR render itself never imports).
import 'virtual:solid-server-function-manifest';
import App from './App';
import { getServerFunction } from './runtime/server';
import { deserializeFromText, serializeToText } from './runtime/shared';

export function render() {
  return renderToStream(() => <App />, { manifest });
}

/** HTTP endpoint for the prototype runtime: dispatches /_server requests. */
export async function handleServerFunction(request: Request): Promise<Response> {
  const id = request.headers.get('x-server-function');
  if (!id) {
    return new Response('missing x-server-function header', { status: 400 });
  }

  let fn: (...args: unknown[]) => unknown;
  try {
    fn = getServerFunction(id);
  } catch (error) {
    return new Response(String(error), { status: 404 });
  }

  const body = await request.text();
  const args = body ? deserializeFromText<unknown[]>(body) : [];

  const event = { request, locals: {} };
  try {
    const result = await provideRequestEvent(event as any, () => fn(...args));
    return new Response(await serializeToText(result), {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  } catch (error) {
    return new Response(await serializeToText(error), {
      status: 500,
      headers: { 'content-type': 'text/plain', 'x-error': '1' },
    });
  }
}
