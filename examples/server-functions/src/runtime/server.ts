// Server half of the prototype runtime ABI. The compiled server build calls
// `createServerReference(id, fn)` for every server function (registering it
// for HTTP dispatch) and `cloneServerReference(ref)` where the function was
// referenced — during SSR the original function runs in-process.

export interface ServerFunctionReference {
  id: string;
  fn: (...args: any[]) => any;
}

const registry = new Map<string, ServerFunctionReference['fn']>();

export function createServerReference(
  id: string,
  fn: ServerFunctionReference['fn'],
): ServerFunctionReference {
  registry.set(id, fn);
  return { id, fn };
}

export function cloneServerReference({ id, fn }: ServerFunctionReference) {
  if (typeof fn !== 'function') {
    throw new Error(`Export "${id}" from a 'use server' module must be a function`);
  }
  return fn;
}

/** Used by the HTTP handler to dispatch incoming server function calls. */
export function getServerFunction(id: string): ServerFunctionReference['fn'] {
  const fn = registry.get(id);
  if (!fn) {
    throw new Error(`Unknown server function: ${id}`);
  }
  return fn;
}
