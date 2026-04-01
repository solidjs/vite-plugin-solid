import { type Accessor, createEffect, createSignal, onSettled } from 'solid-js';

function model(
  value: [Accessor<string>, (value: string) => void],
) {
  let element: HTMLInputElement;
  const [field, setField] = value;
  createEffect(field, (field) => {
    element.value = field;
  });
  onSettled(() => {
    element.addEventListener('input', (e: Event & { currentTarget: HTMLInputElement }) =>
      setField(e.currentTarget.value),
    );
  })
  return (el: HTMLInputElement) => element = el;
}

export default function Home() {
  const [name, setName] = createSignal('');
  return (
    <>
      <input type="text" ref={model([name, setName])} />
      <h1>Hello {name()}</h1>
    </>
  );
}
