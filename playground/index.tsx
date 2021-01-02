import { render } from 'solid-js/web';

const dispose = render(() => <h1>Hello world!!!</h1>, document.getElementById('app'));

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(dispose);
}
