import { MetaProvider } from 'solid-meta';
import { Router, Route, RouteDefinition } from 'solid-app-router';
import { Link } from 'solid-app-router';
import { render } from 'solid-js/web';
import { createApp } from 'solid-utils';

const pages = import.meta.globEager('./pages/*.tsx');

const routes = Object.entries(pages).map<RouteDefinition>(([file, { default: component }]) => {
  const path = file
    .replace('./pages', '')
    .replace('index', '')
    .replace(/\.[tj]sx?/gi, '');

  return { component, path } as RouteDefinition;
});

const App = () => (
  <>
    <Link href="/">Home</Link>
    <Link href="/about">About!!!</Link>
    <Route />
  </>
);

const dispose = render(
  () => (
    <Router routes={routes}>
      <MetaProvider>
        <App />
      </MetaProvider>
    </Router>
  ),
  document.getElementById('app'),
);

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(dispose);
}
