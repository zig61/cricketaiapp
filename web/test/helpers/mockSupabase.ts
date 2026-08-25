import { vi } from "vitest";

/**
 * A chainable, awaitable stand-in for a Supabase PostgrestQueryBuilder call.
 * Every query-builder method (select/eq/neq/order/limit/insert/update)
 * returns the same object so any chain shape works; awaiting the object
 * itself (or calling .maybeSingle()/.single()) resolves to `result`.
 */
export function queryResult(result: { data: unknown; error?: unknown }) {
  const resolved = { error: null, ...result };
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    order: () => chain,
    limit: () => chain,
    insert: () => chain,
    update: () => chain,
    maybeSingle: () => Promise.resolve(resolved),
    single: () => Promise.resolve(resolved),
    then: (onFulfilled: (value: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

export function mockSupabaseClient() {
  return {
    auth: {
      getClaims: vi.fn(),
    },
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
  };
}

export type MockSupabaseClient = ReturnType<typeof mockSupabaseClient>;
