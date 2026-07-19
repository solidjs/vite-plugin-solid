'use server';

export async function getServerMessage(name: string) {
  return `hello ${name} from the server`;
}
