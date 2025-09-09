export type Primitive = string | number | boolean | null | undefined;

export type Operator = '==' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'in' | 'between';

export type ComparisonNode = {
  kind: 'comparison';
  field: string[]; // caminho: ex. ["endereco","cidade"]
  op: Operator;
  value?: Primitive;
  values?: Primitive[]; // para IN
  range?: { min: Primitive; max: Primitive }; // para BETWEEN
};

export type NotNode = { kind: 'not'; node: AST };
export type AndNode = { kind: 'and'; left: AST; right: AST };
export type OrNode = { kind: 'or'; left: AST; right: AST };
export type GroupNode = { kind: 'group'; node: AST };

export type AST = ComparisonNode | NotNode | AndNode | OrNode | GroupNode;

type Token =
  | { t: 'LPAREN' }
  | { t: 'RPAREN' }
  | { t: 'AND' | 'OR' | 'NOT' }
  | { t: 'OP'; v: Operator }
  | { t: 'IDENT'; v: string }
  | { t: 'NUMBER'; v: number }
  | { t: 'BOOL'; v: boolean }
  | { t: 'STRING'; v: string }
  | { t: 'COMMA' }
  | { t: 'EOF' };

const KEYWORDS = new Set(['and', 'or', 'not', 'contains', 'in', 'between', 'true', 'false']);

function isWhitespace(ch: string) {
  return /\s/.test(ch);
}

function isIdentStart(ch: string) {
  return /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch: string) {
  return /[A-Za-z0-9_\.]/.test(ch);
}

function tokenize(input: string): Token[] {
  const s = input || '';
  const tokens: Token[] = [];
  let i = 0;

  const push = (tok: Token) => tokens.push(tok);
  const len = s.length;

  while (i < len) {
    const ch = s[i];
    if (isWhitespace(ch)) { i++; continue; }
    if (ch === '(') { push({ t: 'LPAREN' }); i++; continue; }
    if (ch === ')') { push({ t: 'RPAREN' }); i++; continue; }
    if (ch === ',') { push({ t: 'COMMA' }); i++; continue; }
    if (ch === '"' || ch === '\'') {
      const quote = ch; i++;
      let buf = '';
      while (i < len) {
        const c = s[i];
        if (c === '\\' && i + 1 < len) { buf += s[i + 1]; i += 2; continue; }
        if (c === quote) { i++; break; }
        buf += c; i++;
      }
      push({ t: 'STRING', v: buf });
      continue;
    }
    if (/[0-9\-]/.test(ch)) {
      const start = i;
      i++;
      while (i < len && /[0-9eE\+\.-]/.test(s[i])) i++;
      const numStr = s.slice(start, i);
      const num = Number(numStr);
      if (Number.isFinite(num)) push({ t: 'NUMBER', v: num }); else push({ t: 'STRING', v: numStr });
      continue;
    }
    if (isIdentStart(ch)) {
      const start = i;
      i++;
      while (i < len && isIdentPart(s[i])) i++;
      const raw = s.slice(start, i);
      const lower = raw.toLowerCase();
      if (lower === 'and') push({ t: 'AND' });
      else if (lower === 'or') push({ t: 'OR' });
      else if (lower === 'not') push({ t: 'NOT' });
      else if (lower === 'true') push({ t: 'BOOL', v: true });
      else if (lower === 'false') push({ t: 'BOOL', v: false });
      else if (lower === 'contains') push({ t: 'OP', v: 'contains' });
      else if (lower === 'in') push({ t: 'OP', v: 'in' });
      else if (lower === 'between') push({ t: 'OP', v: 'between' });
      else push({ t: 'IDENT', v: raw });
      continue;
    }
    // operators
    if (s.startsWith('>=', i)) { push({ t: 'OP', v: '>=' }); i += 2; continue; }
    if (s.startsWith('<=', i)) { push({ t: 'OP', v: '<=' }); i += 2; continue; }
    if (s.startsWith('!=', i)) { push({ t: 'OP', v: '!=' }); i += 2; continue; }
    if (s[i] === '>') { push({ t: 'OP', v: '>' }); i++; continue; }
    if (s[i] === '<') { push({ t: 'OP', v: '<' }); i++; continue; }
    if (s[i] === '=' || s.startsWith('==', i)) { push({ t: 'OP', v: '==' }); i += s[i+1] === '=' ? 2 : 1; continue; }

    // fallback: skip unknown
    i++;
  }
  push({ t: 'EOF' });
  return tokens;
}

class Parser {
  private tokens: Token[];
  private idx = 0;
  constructor(tokens: Token[]) { this.tokens = tokens; }
  private peek(): Token { return this.tokens[this.idx]; }
  private next(): Token { return this.tokens[this.idx++]; }
  private expect(type: Token['t']) {
    const t = this.next();
    if (t.t !== type) throw new Error(`Esperado ${type}, obtido ${t.t}`);
    return t;
  }
  parse(): AST {
    const node = this.parseOr();
    return node;
  }
  private parseOr(): AST {
    let left = this.parseAnd();
    while (this.peek().t === 'OR') { this.next(); const right = this.parseAnd(); left = { kind: 'or', left, right }; }
    return left;
  }
  private parseAnd(): AST {
    let left = this.parseNot();
    while (this.peek().t === 'AND') { this.next(); const right = this.parseNot(); left = { kind: 'and', left, right }; }
    return left;
  }
  private parseNot(): AST {
    if (this.peek().t === 'NOT') { this.next(); const node = this.parsePrimary(); return { kind: 'not', node }; }
    return this.parsePrimary();
  }
  private parsePrimary(): AST {
    const t = this.peek();
    if (t.t === 'LPAREN') { this.next(); const node = this.parseOr(); this.expect('RPAREN'); return { kind: 'group', node }; }
    return this.parseComparison();
  }
  private parseComparison(): AST {
    const fieldTokens: string[] = [];
    const id = this.expect('IDENT') as any;
    fieldTokens.push(id.v);
    while (this.peek().t === 'IDENT' && (this.tokens[this.idx - 1] as any)?.v?.endsWith('.')) {
      const nxt = this.next() as any; fieldTokens.push(nxt.v);
    }
    // suporta caminho com pontos no IDENT diretamente
    const fieldPath = id.v.split('.');
    const opTok = this.next();
    if (opTok.t !== 'OP') throw new Error('Operador esperado');
    const op = opTok.v as Operator;

    if (op === 'in') {
      this.expect('LPAREN');
      const values: Primitive[] = [];
      while (true) {
        const v = this.parseLiteral();
        values.push(v);
        if (this.peek().t === 'COMMA') { this.next(); continue; }
        break;
      }
      this.expect('RPAREN');
      return { kind: 'comparison', field: fieldPath, op: 'in', values };
    }
    if (op === 'between') {
      const min = this.parseLiteral();
      // opcional "and"
      if (this.peek().t === 'AND') this.next();
      const max = this.parseLiteral();
      return { kind: 'comparison', field: fieldPath, op: 'between', range: { min, max } };
    }
    const value = this.parseLiteral();
    return { kind: 'comparison', field: fieldPath, op, value };
  }
  private parseLiteral(): Primitive {
    const t = this.next();
    if (t.t === 'NUMBER') return t.v;
    if (t.t === 'STRING') return t.v;
    if (t.t === 'BOOL') return t.v;
    if (t.t === 'IDENT') return t.v; // trata como string sem aspas
    throw new Error('Literal esperado');
  }
}

export function parsePredicate(input: string): AST {
  const tokens = tokenize(input);
  const p = new Parser(tokens);
  return p.parse();
}

function getByPath(obj: any, path: string[]): Primitive {
  let cur: any = obj;
  for (const key of path) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur as Primitive;
}

function asComparable(v: Primitive): Primitive {
  return v as any;
}

function compare(op: Operator, left: Primitive, right: Primitive | Primitive[] | { min: Primitive; max: Primitive }): boolean {
  const l: any = asComparable(left);
  switch (op) {
    case '==': return String(l) === String(right as any);
    case '!=': return String(l) !== String(right as any);
    case '>': return Number(l) > Number(right as any);
    case '>=': return Number(l) >= Number(right as any);
    case '<': return Number(l) < Number(right as any);
    case '<=': return Number(l) <= Number(right as any);
    case 'contains': return (String(l)).toLowerCase().includes(String(right as any).toLowerCase());
    case 'in': return Array.isArray(right) ? (right as Primitive[]).map(String).includes(String(l)) : false;
    case 'between': {
      const r = right as { min: Primitive; max: Primitive };
      const n = Number(l);
      return n >= Number(r.min) && n <= Number(r.max);
    }
    default: return false;
  }
}

export type CompiledPredicate = (props: Record<string, any>) => boolean;

export function compilePredicate(input: string): CompiledPredicate {
  const ast = parsePredicate(input);
  const evalNode = (node: AST, props: Record<string, any>): boolean => {
    switch (node.kind) {
      case 'group': return evalNode(node.node, props);
      case 'not': return !evalNode(node.node, props);
      case 'and': return evalNode(node.left, props) && evalNode(node.right, props);
      case 'or': return evalNode(node.left, props) || evalNode(node.right, props);
      case 'comparison': {
        const left = getByPath(props, node.field);
        if (node.op === 'in') return compare('in', left, node.values || []);
        if (node.op === 'between') return compare('between', left, node.range!);
        return compare(node.op, left, node.value);
      }
    }
  };
  return (props: Record<string, any>) => {
    try { return evalNode(ast, props || {}); } catch { return false; }
  };
}


