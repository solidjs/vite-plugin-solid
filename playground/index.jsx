import { render } from 'solid-js/web';
import { Router, Route } from 'solid-app-router';

const App = () => <Route />;

const routes = [
  {
    path: '/',
    component: () => <h1>Hello world</h1>,
  },
];

const dispose = render(
  () => (
    <Router routes={routes}>
      <App />
    </Router>
  ),
  document.getElementById('app'),
);

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(dispose);
}
