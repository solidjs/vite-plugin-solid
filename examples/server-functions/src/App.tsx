import { createSignal } from 'solid-js';
import { HydrationScript } from '@solidjs/web';
import { getServerMessage, greet, hasSecret, requestMethod } from './api';
import HmrTarget from './HmrTarget';

// Injected by the vite config's `define`; names the active JSX backend so
// the e2e can assert which compiler served the page.
declare const __JSX_COMPILER__: string;

export default function App() {
  const [message, setMessage] = createSignal('');
  const [doubled, setDoubled] = createSignal('');
  const [method, setMethod] = createSignal('');
  const [secret, setSecret] = createSignal('');
  const [greeting, setGreeting] = createSignal('');
  // Client state owned by App: the HMR test increments it, then edits
  // HmrTarget.tsx and asserts the count survives the hot update.
  const [count, setCount] = createSignal(0);

  // Function-level directive inside a component: the compiler hoists the body
  // to a module-level registration on the server and swaps in a reference on
  // the client. (Bodies must not close over component scope.)
  const double = async (n: number) => {
    'use server';
    return n * 2;
  };

  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Server Functions</title>
        <HydrationScript />
      </head>
      <body>
        <h1>Server Functions</h1>
        <button id="call-message" onClick={async () => setMessage(await getServerMessage('client'))}>
          message
        </button>
        <button id="call-double" onClick={async () => setDoubled(String(await double(21)))}>
          double
        </button>
        <button id="call-method" onClick={async () => setMethod(await requestMethod())}>
          method
        </button>
        <button id="call-secret" onClick={async () => setSecret(String(await hasSecret()))}>
          secret
        </button>
        <button
          id="call-respond"
          onClick={async () => {
            // The transport unwraps respond()'s envelope: the caller receives
            // the carried value, not the ResponseEnvelope the source signature
            // declares.
            const result = (await greet('client')) as unknown as { greeting: string };
            setGreeting(result.greeting);
          }}
        >
          respond
        </button>
        <button id="increment" onClick={() => setCount(count() + 1)}>
          count
        </button>
        <p id="count">{count()}</p>
        <p id="jsx-compiler">{__JSX_COMPILER__}</p>
        <HmrTarget />
        <p id="message">{message()}</p>
        <p id="doubled">{doubled()}</p>
        <p id="method">{method()}</p>
        <p id="secret">{secret()}</p>
        <p id="greeting">{greeting()}</p>
        <script type="module" src="/src/entry-client.tsx" async />
      </body>
    </html>
  );
}
