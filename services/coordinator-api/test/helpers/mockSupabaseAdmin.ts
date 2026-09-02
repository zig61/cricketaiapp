import { vi } from "vitest";

/**
 * A chainable, awaitable stand-in for a Supabase PostgrestQueryBuilder call —
 * same pattern used in web/'s test suite. Every query-builder method returns
 * the same object so any chain shape works; awaiting it (or calling
 * .maybeSingle()/.single()) resolves to `result`.
 */
export function queryResult(result: { data: unknown; error?: unknown }) {
  const resolved = { error: null, ...result };
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    insert: () => chain,
    update: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(resolved),
    single: () => Promise.resolve(resolved),
    then: (onFulfilled: (value: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

export function mockSupabaseAdmin() {
  return {
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
  };
}

export type MockSupabaseAdmin = ReturnType<typeof mockSupabaseAdmin>;
