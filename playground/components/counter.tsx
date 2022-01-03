import { Component, createSignal } from 'solid-js';

const Counter: Component = () => {
  const style = { padding: '8px', color: 'white', background: 'black', borderRadius: '4px' };

  const [click, setClick] = createSignal(0);
  const increment = () => setClick((click) => click + 1);
  const decrement = () => setClick((click) => click - 1);

  return (
    <>
      <button onClick={decrement} style={style}>
        -1
      </button>
      <span>{click()}</span>
      <button onClick={increment} style={style}>
        +1
      </button>
    </>
  );
};

export default Counter;
