// The entire app the user writes for turnkey SSR: a plain content component
// (no <html>, no HydrationScript, no entries — the plugin's generated
// document shell provides all of that). Exercises, for test/run.mjs:
// - hydration + client interactivity (the counter),
// - streaming (the async section renders after the shell),
// - server functions alongside SSR (the message button),
// - HMR (HmrTarget is edited on disk by the test),
// - CSS handling (App.css must reach the page in dev and prod).
import { createMemo, createSignal, Loading } from 'solid-js';
import { getServerMessage } from './api';
import HmrTarget from './HmrTarget';
import './App.css';

export default function App() {
  const [count, setCount] = createSignal(0);
  const [message, setMessage] = createSignal('');

  // Async-generator memo inside a Loading boundary: the SSR shell streams
  // immediately with the fallback, the yielded content follows in a later
  // chunk once it resolves.
  const streamed = createMemo(async function* () {
    await new Promise((resolve) => setTimeout(resolve, 300));
    yield 'STREAMED-ASYNC-CONTENT';
  });

  return (
    <main>
      <h1 id="title">Turnkey SSR</h1>
      <button id="increment" onClick={() => setCount(count() + 1)}>
        count
      </button>
      <p id="count">{count()}</p>
      <button id="call-message" onClick={async () => setMessage(await getServerMessage('client'))}>
        message
      </button>
      <p id="message">{message()}</p>
      <HmrTarget />
      <Loading fallback={<p id="stream-fallback">streaming…</p>}>
        <p id="streamed">{streamed()}</p>
      </Loading>
    </main>
  );
}
