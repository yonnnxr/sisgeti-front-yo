"use client";

import { useEffect, useMemo, useState } from "react";
import FloatingPanel from "./FloatingPanel";

type OLFeature = any;

type FieldType = 'number' | 'string' | 'boolean';

type FieldStat = {
  name: string;
  type: FieldType;
  min?: number;
  max?: number;
  distinct?: Array<string | number | boolean>;
  emptyCount: number;
};

type Rule = {
  field: string;
  op: string;
  value?: string | number | boolean;
  values?: Array<string | number | boolean>;
  range?: { min?: number; max?: number };
};

interface FilterBuilderProps {
  layerId: string;
  isDark?: boolean;
  fetchFeatures: () => OLFeature[];
  onApply: (predicate: string) => void;
  onClose: () => void;
}

const NUM_OPS = ['==','!=','>','>=','<','<=','between','in'];
const STR_OPS = ['==','!=','contains','in'];
const BOOL_OPS = ['==','!='];

function detectType(values: any[]): FieldType {
  let hasNum = 0, hasStr = 0, hasBool = 0, total = 0;
  for (const v of values) {
    if (v == null) continue;
    total++;
    if (typeof v === 'number') { hasNum++; continue; }
    if (typeof v === 'boolean') { hasBool++; continue; }
    if (typeof v === 'string') {
      const n = Number(v);
      if (Number.isFinite(n) && String(n) === v.trim()) hasNum++; else hasStr++;
      continue;
    }
    // objetos tratamos como string
    hasStr++;
  }
  if (hasBool > 0 && hasBool >= hasNum && hasBool >= hasStr) return 'boolean';
  if (hasNum > 0 && hasNum >= hasStr) return 'number';
  return 'string';
}

function escapeString(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function valueToLiteral(v: any, type: FieldType): string {
  if (type === 'number') return String(Number(v));
  if (type === 'boolean') return String(Boolean(v));
  return escapeString(String(v));
}

function isValidFieldIdent(name: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(name);
}

function buildPredicate(rules: Rule[], stats: Record<string, FieldStat>, groupOp: 'AND' | 'OR'): string {
  const parts: string[] = [];
  for (const r of rules) {
    const st = stats[r.field];
    if (!st) continue;
    const field = isValidFieldIdent(r.field) ? r.field : r.field.replace(/[^A-Za-z0-9_\.]/g, '_');
    switch (r.op) {
      case 'between': {
        const min = valueToLiteral(r.range?.min ?? 0, st.type);
        const max = valueToLiteral(r.range?.max ?? 0, st.type);
        parts.push(`${field} between ${min} and ${max}`);
        break;
      }
      case 'in': {
        const arr = (r.values || []).map(v => valueToLiteral(v, st.type)).join(', ');
        parts.push(`${field} in (${arr})`);
        break;
      }
      case 'contains': {
        const val = valueToLiteral(r.value ?? '', 'string');
        parts.push(`${field} contains ${val}`);
        break;
      }
      case '==': case '!=': case '>': case '>=': case '<': case '<=': {
        const val = valueToLiteral(r.value, st.type);
        parts.push(`${field} ${r.op} ${val}`);
        break;
      }
      default: break;
    }
  }
  return parts.length ? parts.join(groupOp === 'AND' ? ' and ' : ' or ') : '';
}

export default function FilterBuilder({ layerId, isDark, fetchFeatures, onApply, onClose }: FilterBuilderProps) {
  const [sample, setSample] = useState<OLFeature[]>([]);
  const [stats, setStats] = useState<Record<string, FieldStat>>({});
  const [rules, setRules] = useState<Rule[]>([]);
  const [groupOp, setGroupOp] = useState<'AND' | 'OR'>('AND');

  useEffect(() => {
    try {
      const feats = (fetchFeatures() || []).slice(0, 300);
      setSample(feats);
      const agg: Record<string, any[]> = {};
      for (const f of feats) {
        const props = { ...(f.getProperties?.() || {}) } as Record<string, any>;
        delete (props as any).geometry;
        for (const k of Object.keys(props)) {
          (agg[k] = agg[k] || []).push(props[k]);
        }
      }
      const out: Record<string, FieldStat> = {};
      for (const k of Object.keys(agg)) {
        const values = agg[k];
        const t = detectType(values);
        if (t === 'number') {
          const nums = values.map(v => Number(v)).filter(n => Number.isFinite(n));
          const min = nums.length ? Math.min(...nums) : undefined;
          const max = nums.length ? Math.max(...nums) : undefined;
          out[k] = { name: k, type: 'number', min, max, emptyCount: values.length - nums.length };
        } else if (t === 'boolean') {
          const distinct = Array.from(new Set(values.filter(v => v != null).map(v => Boolean(v)))) as boolean[];
          out[k] = { name: k, type: 'boolean', distinct, emptyCount: values.filter(v => v == null).length };
        } else {
          const uniq = Array.from(new Set(values.filter(v => v != null).map(v => String(v)))) as string[];
          const distinct = uniq.slice(0, 50);
          out[k] = { name: k, type: 'string', distinct, emptyCount: values.filter(v => v == null).length };
        }
      }
      setStats(out);
      // seed uma regra com o primeiro campo
      const first = Object.keys(out)[0];
      if (first) {
        const st = out[first];
        const op = st.type === 'number' ? '>=' : (st.type === 'boolean' ? '==' : 'contains');
        setRules([{ field: first, op, value: st.type === 'boolean' ? true : (st.type === 'number' ? st.min ?? 0 : '') }]);
      }
    } catch {}
  }, [layerId]);

  const fieldList = useMemo(() => Object.values(stats).sort((a, b) => a.name.localeCompare(b.name)), [stats]);

  const handleAddRule = () => {
    const f = fieldList[0];
    if (!f) return;
    const op = f.type === 'number' ? '>=' : (f.type === 'boolean' ? '==' : 'contains');
    setRules(r => [...r, { field: f.name, op, value: f.type === 'boolean' ? true : (f.type === 'number' ? f.min ?? 0 : '') }]);
  };

  const handleChangeRule = (idx: number, patch: Partial<Rule>) => {
    setRules(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const predicate = useMemo(() => buildPredicate(rules, stats, groupOp), [rules, stats, groupOp]);

  return (
    <FloatingPanel
      title={`Filtros - ${layerId}`}
      panelId={`filter-builder-${layerId}`}
      width={520}
      height={420}
      minWidth={360}
      minHeight={240}
      resizable
      defaultPosition="bottom-right"
      isDark={!!isDark}
      onClose={onClose}
    >
      <div className="flex gap-3 h-full">
        {/* Campos */}
        <div className="w-56 border-r pr-2 overflow-auto">
          <div className={`text-xs ${isDark ? 'text-slate-300' : 'text-gray-600'} mb-2`}>Campos detectados</div>
          <div className="space-y-1">
            {fieldList.map((f) => (
              <button key={f.name} onClick={() => setRules(rs => rs.concat({ field: f.name, op: f.type === 'number' ? '>=' : (f.type === 'boolean' ? '==' : 'contains'), value: f.type === 'boolean' ? true : (f.type === 'number' ? f.min ?? 0 : '') }))} className={`w-full text-left text-sm px-2 py-1 rounded ${isDark ? 'hover:bg-slate-700 text-slate-100' : 'hover:bg-gray-100 text-gray-800'}`}>
                <div className="flex items-center justify-between">
                  <span className="truncate">{f.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-gray-100 text-gray-700 border border-gray-300'}`}>{f.type}</span>
                </div>
                {f.type === 'number' && (
                  <div className={`text-[10px] ${isDark ? 'text-slate-300' : 'text-gray-500'}`}>min {f.min} • max {f.max}</div>
                )}
                {f.type !== 'number' && f.distinct && (
                  <div className={`text-[10px] ${isDark ? 'text-slate-300' : 'text-gray-500'} truncate`}>{f.distinct.slice(0,3).join(', ')}{(f.distinct.length||0) > 3 ? '…' : ''}</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Regras */}
        <div className="flex-1 flex flex-col gap-2 overflow-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span>Combinar com</span>
              <select value={groupOp} onChange={(e) => setGroupOp(e.target.value as any)} className={`${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white text-gray-900'} border rounded px-2 py-1`}>
                <option value="AND">E (AND)</option>
                <option value="OR">OU (OR)</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleAddRule} className={`${isDark ? 'bg-slate-700 text-slate-100' : 'bg-gray-200 text-gray-800'} px-2 py-1 text-xs rounded`}>Adicionar Regra</button>
              <button onClick={() => setRules([])} className={`${isDark ? 'bg-slate-700 text-slate-100' : 'bg-gray-200 text-gray-800'} px-2 py-1 text-xs rounded`}>Limpar</button>
            </div>
          </div>

          <div className="space-y-2">
            {rules.map((r, idx) => {
              const st = stats[r.field] || fieldList[0];
              const ops = st ? (st.type === 'number' ? NUM_OPS : st.type === 'boolean' ? BOOL_OPS : STR_OPS) : STR_OPS;
              return (
                <div key={idx} className={`flex items-center gap-2 p-2 rounded border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-300'}`}>
                  <select value={r.field} onChange={(e) => handleChangeRule(idx, { field: e.target.value })} className={`px-2 py-1 rounded border ${isDark ? 'bg-slate-700 border-slate-500 text-slate-100' : 'bg-white border-gray-300'}`}>
                    {fieldList.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                  </select>
                  <select value={r.op} onChange={(e) => handleChangeRule(idx, { op: e.target.value })} className={`px-2 py-1 rounded border ${isDark ? 'bg-slate-700 border-slate-500 text-slate-100' : 'bg-white border-gray-300'}`}>
                    {ops.map(op => <option key={op} value={op}>{op}</option>)}
                  </select>
                  {/* values */}
                  {(() => {
                    if (!st) return null;
                    if (r.op === 'between' && st.type === 'number') {
                      return (
                        <div className="flex items-center gap-1">
                          <input type="number" className={`w-24 px-2 py-1 rounded border ${isDark ? 'bg-slate-700 border-slate-500 text-slate-100' : 'bg-white border-gray-300'}`} defaultValue={st.min ?? 0} onChange={(e) => handleChangeRule(idx, { range: { ...(r.range||{}), min: Number(e.target.value) } })} />
                          <span className={`text-xs ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>até</span>
                          <input type="number" className={`w-24 px-2 py-1 rounded border ${isDark ? 'bg-slate-700 border-slate-500 text-slate-100' : 'bg-white border-gray-300'}`} defaultValue={st.max ?? 0} onChange={(e) => handleChangeRule(idx, { range: { ...(r.range||{}), max: Number(e.target.value) } })} />
                        </div>
                      );
                    }
                    if (r.op === 'in') {
                      const options = (st.distinct || []).slice(0, 50);
                      return (
                        <select multiple className={`min-w-[160px] px-2 py-1 rounded border ${isDark ? 'bg-slate-700 border-slate-500 text-slate-100' : 'bg-white border-gray-300'}`} onChange={(e) => {
                          const arr: any[] = [];
                          const opts = Array.from(e.target.selectedOptions);
                          for (const o of opts) arr.push(st.type === 'number' ? Number(o.value) : (st.type === 'boolean' ? (o.value === 'true') : o.value));
                          handleChangeRule(idx, { values: arr });
                        }}>
                          {options.map((v, i) => <option key={i} value={String(v)}>{String(v)}</option>)}
                        </select>
                      );
                    }
                    if (st.type === 'boolean') {
                      return (
                        <select value={String(r.value ?? true)} onChange={(e) => handleChangeRule(idx, { value: e.target.value === 'true' })} className={`px-2 py-1 rounded border ${isDark ? 'bg-slate-700 border-slate-500 text-slate-100' : 'bg-white border-gray-300'}`}>
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      );
                    }
                    if (st.type === 'number') {
                      return (
                        <input type="number" className={`w-32 px-2 py-1 rounded border ${isDark ? 'bg-slate-700 border-slate-500 text-slate-100' : 'bg-white border-gray-300'}`} defaultValue={Number(r.value ?? st.min ?? 0)} onChange={(e) => handleChangeRule(idx, { value: Number(e.target.value) })} />
                      );
                    }
                    return (
                      <input type="text" className={`w-40 px-2 py-1 rounded border ${isDark ? 'bg-slate-700 border-slate-500 text-slate-100' : 'bg-white border-gray-300'}`} defaultValue={String(r.value ?? '')} onChange={(e) => handleChangeRule(idx, { value: e.target.value })} />
                    );
                  })()}
                  <button onClick={() => setRules(rs => rs.filter((_, i) => i !== idx))} className={`${isDark ? 'bg-slate-700 text-slate-100' : 'bg-gray-200 text-gray-800'} px-2 py-1 text-xs rounded`}>Remover</button>
                </div>
              );
            })}
          </div>

          {/* Preview e aplicar */}
          <div className="mt-auto pt-2 border-t">
            <div className={`text-xs mb-2 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Predicado gerado</div>
            <div className={`text-xs p-2 rounded ${isDark ? 'bg-slate-800 text-slate-100' : 'bg-gray-100 text-gray-800'}`}>{predicate || '(vazio)'}</div>
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={() => onClose()} className={`${isDark ? 'bg-slate-700 text-slate-100' : 'bg-gray-200 text-gray-800'} px-3 py-1 text-sm rounded`}>Cancelar</button>
              <button onClick={() => onApply(predicate)} disabled={!predicate} className={`${!predicate ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white px-3 py-1 text-sm rounded`}>Aplicar</button>
            </div>
          </div>
        </div>
      </div>
    </FloatingPanel>
  );
}


