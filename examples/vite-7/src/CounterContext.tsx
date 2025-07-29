import { createContext, createSignal, JSX, onCleanup, onMount, useContext } from "solid-js";

interface CounterContext {
  value(): number;
  increment(): void;
  decrement(): void;
}


const CounterContext = createContext<CounterContext>();

export function useCounter() {
  const ctx = useContext(CounterContext);
  if (!ctx) {
    throw new Error('Missing CounterContext');
  }
  return ctx;
}

export function CounterProvider(props: { children: JSX.Element }) {
  const [value, setValue] = createSignal(0);

  function increment() {
    setValue((c) => c + 1);
  }

  function decrement() {
    setValue((c) => c - 1);
  }
  onMount(() => {
    console.log('Mounted CounterProvider');
  });
  onCleanup(() => {
    console.log('Unmounted CounterProvider');
  });

  return (
    <CounterContext.Provider value={{ value, increment, decrement }}>
      <h1>Counter</h1>
      {props.children}
    </CounterContext.Provider>
  );
}
