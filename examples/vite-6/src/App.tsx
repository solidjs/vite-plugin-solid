import { onCleanup, onMount } from "solid-js";
import { CounterProvider, useCounter } from "./CounterContext";

const title = 'Count';

function Count() {
  const counter = useCounter();
  onMount(() => {
    console.log('Mounted Count');
  });
  onCleanup(() => {
    console.log('Unmounted Count');
  });
  return (
    <h1>{title}: {counter.value()}</h1>
  );
}

function Increment() {
  const counter = useCounter();
  onMount(() => {
    console.log('Mounted Increment');
  });
  onCleanup(() => {
    console.log('Unmounted Increment');
  });
  return (
    <button onClick={counter.increment}>
      Increment
    </button>
  );
}

function Decrement() {
  const counter = useCounter();
  onMount(() => {
    console.log('Mounted Decrement');
  });
  onCleanup(() => {
    console.log('Unmounted Decrement');
  });
  return (
    <button onClick={counter.decrement}>
      Decrement
    </button>
  );
}

export default function App() {
  onMount(() => {
    console.log('Mounted App');
  });
  onCleanup(() => {
    console.log('Unmounted App');
  });

  return (
    <CounterProvider>
      <Count />
      <Increment />
      <Decrement />
    </CounterProvider>
  );
}