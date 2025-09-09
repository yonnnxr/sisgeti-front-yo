"use client";

import { useEffect, useMemo, useState } from "react";

type DbKind = 'postgres' | 'mssql' | 'mysql';

export type DbConnection = {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean; // postgres
  encrypt?: boolean; // mssql
  trustServerCertificate?: boolean; // mssql
};

export type DbProfile = {
  kind: DbKind;
  name: string;
  connection: DbConnection;
};

const STORAGE_KEY = 'SISGETI_DB_PROFILES';

interface ConnectionProfilesProps {
  kind: DbKind;
  value: DbConnection;
  onChange: (c: Partial<DbConnection>) => void;
}

export default function ConnectionProfiles({ kind, value, onChange }: ConnectionProfilesProps) {
  const [profiles, setProfiles] = useState<DbProfile[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [name, setName] = useState<string>("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      setProfiles(Array.isArray(arr) ? arr : []);
    } catch { setProfiles([]); }
  }, []);

  const currentProfiles = useMemo(() => profiles.filter(p => p.kind === kind), [profiles, kind]);

  const saveProfile = () => {
    if (!name.trim()) return;
    const prof: DbProfile = { kind, name: name.trim(), connection: { ...value } };
    const withoutDup = profiles.filter(p => !(p.kind === kind && p.name === prof.name));
    const next = [...withoutDup, prof];
    setProfiles(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    setSelected(prof.name);
  };

  const applyProfile = (n: string) => {
    setSelected(n);
    const prof = currentProfiles.find(p => p.name === n);
    if (prof) onChange({ ...prof.connection });
  };

  const deleteProfile = (n: string) => {
    const next = profiles.filter(p => !(p.kind === kind && p.name === n));
    setProfiles(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    if (selected === n) setSelected("");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select value={selected} onChange={(e) => applyProfile(e.target.value)} className="px-2 py-1 border rounded w-48">
          <option value="">Selecionar perfil...</option>
          {currentProfiles.map(p => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
        <button onClick={() => selected && deleteProfile(selected)} className="px-2 py-1 text-xs rounded bg-red-600 text-white disabled:bg-red-300" disabled={!selected}>Excluir</button>
      </div>
      <div className="flex items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do perfil" className="px-2 py-1 border rounded w-48" />
        <button onClick={saveProfile} className="px-2 py-1 text-xs rounded bg-blue-600 text-white disabled:bg-blue-300" disabled={!name.trim()}>Salvar</button>
      </div>
    </div>
  );
}




