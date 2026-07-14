// Client half of the prototype runtime ABI. The compiled client build calls
// `cloneServerReference(id)` where a server function was referenced; the
// function body never reaches this bundle. Calls POST the serialized
// arguments to the /_server endpoint handled in server.js.
import { deserializeFromText, serializeToText } from './shared.js';

export function cloneServerReference(id: string) {
  return async (...args: unknown[]) => {
    const response = await fetch('/_server', {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        'x-server-function': id,
      },
      body: await serializeToText(args),
    });
    const result = deserializeFromText<unknown>(await response.text());
    if (!response.ok) {
      throw result;
    }
    return result;
  };
}

// Only ever referenced by server-mode output; present so a misconfigured
// build fails loudly instead of with a missing-export error.
export function createServerReference(): never {
  throw new Error('createServerReference must not be called in the client build');
}
