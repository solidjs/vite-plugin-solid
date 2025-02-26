import { expect, test } from 'vitest';
import { render } from '@solidjs/testing-library';
import user from '@testing-library/user-event';

import App from '../src/App.jsx';

test('App', async () => {
  const { getByText } = render(() => <App />);

  const counterTitle = getByText('Counter');

  const count = counterTitle.nextElementSibling as HTMLElement;
  expect(count).instanceOf(HTMLElement);
  expect(count.innerHTML).toContain('Count: 0');

  const incrementButton = getByText('Increment');
  await user.click(incrementButton);
  expect(count.innerHTML).toContain('Count: 1');

  const decrementButton = getByText('Decrement');
  await user.click(decrementButton);
  expect(count.innerHTML).toContain('Count: 0');
});
