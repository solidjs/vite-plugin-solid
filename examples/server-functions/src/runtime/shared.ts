// Wire codec shared by both sides of the prototype runtime. Values are
// serialized with @solidjs/web/serialization's JSON codec as newline-delimited
// SerovalNode chunks — async values (promises, streams) settle before the
// payload is emitted, which keeps this transport simple at the cost of
// response streaming.
import {
  createJSONDeserializer,
  serializeJSON,
  type SerovalNode,
} from '@solidjs/web/serialization';

export function serializeToText(value: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    serializeJSON(value, {
      onParse(node) {
        chunks.push(JSON.stringify(node));
      },
      onDone() {
        resolve(chunks.join('\n'));
      },
      onError: reject,
    });
  });
}

export function deserializeFromText<T>(text: string): T {
  const deserialize = createJSONDeserializer();
  let root: T | undefined;
  let first = true;
  for (const line of text.split('\n')) {
    if (!line) continue;
    const value = deserialize<T>(JSON.parse(line) as SerovalNode);
    if (first) {
      root = value;
      first = false;
    }
  }
  return root as T;
}
