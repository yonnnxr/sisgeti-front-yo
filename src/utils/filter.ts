export type FieldValue = string | number | boolean | null | undefined;

export function normalizeText(value: FieldValue): string {
  if (value === null || value === undefined) return "";
  const text = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

export function tokenize(query: string): string[] {
  const norm = normalizeText(query);
  if (!norm) return [];
  // tokens únicos para evitar verificações redundantes
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const t of norm.split(" ")) {
    if (t && !seen.has(t)) {
      seen.add(t);
      tokens.push(t);
    }
  }
  return tokens;
}

export function extractFields<T>(item: T, getFields: (item: T) => FieldValue | FieldValue[]): string[] {
  const raw = getFields(item);
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map(v => normalizeText(v))
    .filter(Boolean);
}

export type IndexedItem<T> = { item: T; search: string };

export function buildIndex<T>(items: readonly T[], getFields: (item: T) => FieldValue | FieldValue[]): IndexedItem<T>[] {
  return items.map(item => {
    const parts = extractFields(item, getFields);
    return { item, search: parts.join(" | ") };
  });
}

export function matchAllTokens(search: string, tokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i += 1) {
    if (!search.includes(tokens[i])) return false;
  }
  return true;
}


