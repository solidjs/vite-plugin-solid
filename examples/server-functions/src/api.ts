'use server';
// Module-level directive: every export becomes a server function. The client
// build of this module is replaced entirely by references — the secret below
// (and the @solidjs/web import) must never appear in any client asset, which
// test/run.mjs asserts.
import { getRequestEvent } from '@solidjs/web';

const SERVER_ONLY_SECRET = 'SERVER-ONLY-SECRET-c81d';

export async function getServerMessage(name: string) {
  return `hello ${name} from the server`;
}

export async function hasSecret() {
  return SERVER_ONLY_SECRET.length > 0;
}

export async function requestMethod() {
  const event = getRequestEvent();
  return event ? event.request.method : 'no-event';
}
