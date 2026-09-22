/** Girdi sırasını koruyarak, en fazla `limit` iş aynı anda çalışacak şekilde eşler. */
export async function mapPool<I, O>(
  items: readonly I[],
  limit: number,
  fn: (item: I, index: number) => Promise<O>,
): Promise<O[]> {
  const out = new Array<O>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return out;
}
