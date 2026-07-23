import { createSignal, Loading } from 'solid-js';
import { dynamic } from '@solidjs/web';
import { getFreshPanel, getPanel, incrementCounter } from './data';
import Row from './Row';

/**
 * Server-components page: a plain content component like any other turnkey
 * app root. `serverFunctions: { components: true }` + turnkey SSR's
 * generated entries emit every bit of wiring (the render plugin, the
 * bootstrap script, the client-side installServerComponents() call) — this
 * file is only app code. The test's frames mode points `ssr.app` here.
 *
 * The whole client surface for server components is `dynamic` over a server
 * function call: every response for a call site resolves to the same stable
 * component and the streamed update morphs the boundary underneath.
 *
 * Note the root element: a post-boot-mounted server component resolves to a
 * frame insertable, which core insert only understands in a single-expression
 * position (the `$$FRAME` seam) — under a fragment root the document-level
 * insert reconciles an array and would hand the raw insertable to
 * insertBefore (upstream gap, @solidjs/web 2.0.0-beta.25).
 */
export default function FramesApp() {
  const [name, setName] = createSignal('alpha');
  const [bump, setBump] = createSignal(0);
  // Client-only: mounts a second, never-SSR'd boundary post-boot.
  const [showFresh, setShowFresh] = createSignal(false);

  const Panel = dynamic(() => getPanel(name(), bump()));
  const FreshPanel = dynamic(() => getFreshPanel(name(), bump()));

  return (
    <main>
      <h1>Server Components</h1>
      <button id="nav-beta" onClick={() => setName('beta')}>
        beta
      </button>
      <button id="refetch" onClick={() => setBump(bump() + 1)}>
        refetch
      </button>
      <button
        id="mutate"
        onClick={async () => {
          await incrementCounter();
          setBump(bump() + 1);
        }}
      >
        mutate
      </button>
      <button id="show-fresh" onClick={() => setShowFresh(true)}>
        fresh
      </button>
      <Loading fallback={<p class="loading">loading…</p>}>
        <Panel row={(p: any) => <Row cid={p.cid}>{p.children}</Row>}>
          <input id="draft" placeholder="draft survives navigation" />
        </Panel>
      </Loading>
      {showFresh() && (
        <Loading fallback={<p class="loading">loading fresh…</p>}>
          <FreshPanel row={(p: any) => <Row cid={p.cid}>{p.children}</Row>} />
        </Loading>
      )}
    </main>
  );
}
