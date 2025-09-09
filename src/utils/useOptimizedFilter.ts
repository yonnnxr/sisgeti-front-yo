"use client";

import { useMemo } from "react";
import { buildIndex, FieldValue, IndexedItem, matchAllTokens, tokenize } from "./filter";

export type GetFields<T> = (item: T) => FieldValue | FieldValue[];

export type UseOptimizedFilterResult<T> = {
  filtered: T[];
  indexed: IndexedItem<T>[];
};

export function useOptimizedFilter<T>(items: readonly T[], query: string, getFields: GetFields<T>): UseOptimizedFilterResult<T> {
  const index = useMemo(() => buildIndex(items, getFields), [items, getFields]);
  const tokens = useMemo(() => tokenize(query), [query]);

  const filtered = useMemo(() => {
    if (tokens.length === 0) return items.slice() as T[];
    const out: T[] = [];
    for (let i = 0; i < index.length; i += 1) {
      const { item, search } = index[i];
      if (matchAllTokens(search, tokens)) out.push(item);
    }
    return out;
  }, [index, tokens, items]);

  return { filtered, indexed: index };
}

export default useOptimizedFilter;


