import { render } from "solid-js/dom";

const App = () => <h1>Hello world!!!</h1>;

export const rootEl = document.getElementById("app");
export const dispose = render(() => App, rootEl);
