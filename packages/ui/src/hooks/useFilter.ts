import { useMemo } from "react";

export function useFilter<T>(
  values: readonly T[],
  predicate: (value: T) => boolean,
): readonly T[] {
  return useMemo(() => values.filter(predicate), [predicate, values]);
}

