import { render } from "solid-js/dom";

const App = () => <h1>Hello world!!!</h1>;

const rootEl = document.getElementById("app");
const dispose = render(() => App, rootEl);

// HMR stuff, this will be automatically removed during build
// /!\ You need to add "vite" in the "compilerOptions.types" of your tsconfig.json
// if you want to avoid type errors here
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    dispose();
    rootEl.textContent = "";
  });
}
