export type CompatResult<T = Record<string, unknown>> = {
  results: T[];
  meta: { changes?: number };
};

export type CompatStatement = {
  bind: (...values: unknown[]) => CompatStatement;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<CompatResult<T>>;
  run: () => Promise<CompatResult>;
};

export type CompatDatabase = {
  prepare: (query: string) => CompatStatement;
  batch: <T = Record<string, unknown>>(
    statements: CompatStatement[],
  ) => Promise<Array<CompatResult<T>>>;
};

export function getD1(): CompatDatabase {
  return {
    prepare() {
      throw new Error("This route still requires the Supabase compatibility migration.");
    },
    async batch() {
      throw new Error("This route still requires the Supabase compatibility migration.");
    },
  };
}

export async function ensureDatabase(): Promise<CompatDatabase> {
  return getD1();
}
