import { NextRequest } from 'next/server';
import { Client as PgClient } from 'pg';
import mssql from 'mssql';
import mysql from 'mysql2/promise';
import { parsePredicate } from '@/utils/predicate';

type DbKind = 'postgres' | 'mssql' | 'mysql';

// Catálogo de tabelas com coluna geométrica (simplificado)
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const kind = (url.searchParams.get('kind') || 'postgres') as DbKind;
    if (kind === 'postgres') {
      const client = new PgClient();
      await client.connect();
      const q = `SELECT f_table_schema as schema, f_table_name as table, f_geometry_column as geom, srid, type FROM geometry_columns ORDER BY f_table_schema, f_table_name`;
      const r = await client.query(q);
      await client.end();
      return new Response(JSON.stringify({ kind, tables: r.rows }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (kind === 'mssql') {
      const pool = await mssql.connect({
        server: process.env.MSSQL_HOST as string,
        port: process.env.MSSQL_PORT ? parseInt(process.env.MSSQL_PORT) : undefined,
        user: process.env.MSSQL_USER as string,
        password: process.env.MSSQL_PASSWORD as string,
        database: process.env.MSSQL_DATABASE as string,
        options: { encrypt: true, trustServerCertificate: true }
      } as any);
      // Procurar colunas geometry/geography
      const q = `SELECT sch.name AS schema_name, tbl.name AS table_name, col.name AS geom_name
                 FROM sys.columns col
                 INNER JOIN sys.tables tbl ON col.object_id = tbl.object_id
                 INNER JOIN sys.schemas sch ON tbl.schema_id = sch.schema_id
                 INNER JOIN sys.types typ ON col.user_type_id = typ.user_type_id
                 WHERE typ.name IN ('geometry','geography')
                 ORDER BY sch.name, tbl.name`;
      const r = await pool.request().query(q);
      await pool.close();
      const rows = r.recordset.map((x: any) => ({ schema: x.schema_name, table: x.table_name, geom: x.geom_name }));
      return new Response(JSON.stringify({ kind, tables: rows }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (kind === 'mysql') {
      const conn = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : undefined,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
      });
      const [rows] = await conn.query(`SELECT TABLE_SCHEMA as schema_name, TABLE_NAME as table_name
                                       FROM information_schema.tables
                                       WHERE TABLE_SCHEMA = DATABASE()`);
      await conn.end();
      // MySQL não tem metadado de col geom fácil; usuário informará geom depois
      const out = (rows as any[]).map(r => ({ schema: r.schema_name, table: r.table_name, geom: null }));
      return new Response(JSON.stringify({ kind, tables: out }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'kind inválido' }), { status: 400 });
  } catch (e) {
    console.error('GET /api/db error', e);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
  }
}

// Consulta para GeoJSON. Espera: kind, schema, table, geomColumn, where?, bbox?
export async function POST(req: NextRequest) {
  let lastSql: string | undefined = undefined;
  let lastParams: any[] | undefined = undefined;
  try {
    const body = await req.json();
    const kind = (body.kind || 'postgres') as DbKind;
    const schema = String(body.schema || 'public');
    const table = String(body.table);
    const geom = String(body.geomColumn || 'geom');
    const whereSql: string | undefined = body.where;
    const predicate: string | undefined = body.predicate;
    const bbox: [number, number, number, number] | undefined = body.bbox;
    const limit: number = Math.max(1, Math.min(100000, Number(body.limit) || 100000));
    const conn = body.connection || {};
    if (!table) return new Response(JSON.stringify({ error: 'table requerido' }), { status: 400 });

    // Catálogo via POST (evitar enviar credenciais em URL)
    if (body.action === 'catalog') {
      if (kind === 'postgres') {
        const client = new PgClient({
          host: conn.host || process.env.PGHOST,
          port: conn.port || (process.env.PGPORT ? parseInt(process.env.PGPORT) : undefined),
          database: conn.database || process.env.PGDATABASE,
          user: conn.user || process.env.PGUSER,
          password: conn.password || process.env.PGPASSWORD,
          ssl: conn.ssl ? { rejectUnauthorized: false } : undefined,
        } as any);
        await client.connect();
        const q = `SELECT f_table_schema as schema, f_table_name as table, f_geometry_column as geom, srid, type FROM geometry_columns ORDER BY f_table_schema, f_table_name`;
        const r = await client.query(q);
        await client.end();
        return new Response(JSON.stringify({ kind, tables: r.rows }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (kind === 'mssql') {
        const pool = await mssql.connect({
          server: conn.host || (process.env.MSSQL_HOST as string),
          port: conn.port || (process.env.MSSQL_PORT ? parseInt(process.env.MSSQL_PORT) : undefined),
          user: conn.user || (process.env.MSSQL_USER as string),
          password: conn.password || (process.env.MSSQL_PASSWORD as string),
          database: conn.database || (process.env.MSSQL_DATABASE as string),
          options: { encrypt: conn.encrypt ?? true, trustServerCertificate: conn.trustServerCertificate ?? true }
        } as any);
        const q = `SELECT sch.name AS schema_name, tbl.name AS table_name, col.name AS geom_name
                   FROM sys.columns col
                   INNER JOIN sys.tables tbl ON col.object_id = tbl.object_id
                   INNER JOIN sys.schemas sch ON tbl.schema_id = sch.schema_id
                   INNER JOIN sys.types typ ON col.user_type_id = typ.user_type_id
                   WHERE typ.name IN ('geometry','geography')
                   ORDER BY sch.name, tbl.name`;
        const r = await pool.request().query(q);
        await pool.close();
        const rows = r.recordset.map((x: any) => ({ schema: x.schema_name, table: x.table_name, geom: x.geom_name }));
        return new Response(JSON.stringify({ kind, tables: rows }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (kind === 'mysql') {
        const connection = await mysql.createConnection({
          host: conn.host || process.env.MYSQL_HOST,
          port: conn.port || (process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : undefined),
          user: conn.user || process.env.MYSQL_USER,
          password: conn.password || process.env.MYSQL_PASSWORD,
          database: conn.database || process.env.MYSQL_DATABASE,
        });
        const [rows] = await connection.query(`SELECT TABLE_SCHEMA as schema_name, TABLE_NAME as table_name
                                               FROM information_schema.tables
                                               WHERE TABLE_SCHEMA = DATABASE()`);
        await connection.end();
        const out = (rows as any[]).map(r => ({ schema: r.schema_name, table: r.table_name, geom: null }));
        return new Response(JSON.stringify({ kind, tables: out }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    const sanitizeIdent = (s: string) => String(s || '').replace(/[^a-zA-Z0-9_]/g, '');
    const quoteIdent = (s: string) => '"' + String(s || '').replace(/"/g, '""') + '"';
    const buildWhereFromPredicatePg = (pred?: string): string | null => {
      if (!pred || !pred.trim()) return null;
      try {
        const ast: any = parsePredicate(pred);
        const toSql = (node: any): string => {
          switch (node.kind) {
            case 'group': return `(${toSql(node.node)})`;
            case 'not': return `(NOT ${toSql(node.node)})`;
            case 'and': return `(${toSql(node.left)} AND ${toSql(node.right)})`;
            case 'or': return `(${toSql(node.left)} OR ${toSql(node.right)})`;
            case 'comparison': {
              const field = sanitizeIdent((node.field || []).join('_'));
              const op = node.op as string;
              const lit = (v: any) => {
                if (typeof v === 'number') return String(v);
                if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
                const s = String(v ?? '');
                return `'${s.replace(/'/g, "''")}'`;
              };
              if (op === 'in') {
                const arr = (node.values || []).map((v: any) => lit(v)).join(', ');
                return `${field} IN (${arr})`;
              }
              if (op === 'between') {
                return `${field} BETWEEN ${lit(node.range?.min)} AND ${lit(node.range?.max)}`;
              }
              if (op === 'contains') {
                return `${field} ILIKE '%' || ${lit(node.value)} || '%'`;
              }
              const mapOp: Record<string,string> = { '==': '=', '!=': '<>', '>': '>', '>=': '>=', '<': '<', '<=': '<=' };
              return `${field} ${mapOp[op] || op} ${lit(node.value)}`;
            }
            default: return 'TRUE';
          }
        };
        return toSql(ast);
      } catch {
        return null;
      }
    };

    if (kind === 'postgres') {
      const client = new PgClient({
        host: conn.host || process.env.PGHOST,
        port: conn.port || (process.env.PGPORT ? parseInt(process.env.PGPORT) : undefined),
        database: conn.database || process.env.PGDATABASE,
        user: conn.user || process.env.PGUSER,
        password: conn.password || process.env.PGPASSWORD,
        ssl: conn.ssl ? { rejectUnauthorized: false } : undefined,
      } as any);
      await client.connect();
      const whereParts: string[] = [];
      const params: any[] = [];
      const geomIdent = quoteIdent(geom);
      if (bbox && bbox.length === 4 && bbox.every((v) => Number.isFinite(v))) {
        whereParts.push(`${geomIdent} && ST_MakeEnvelope($${params.length + 1}, $${params.length + 2}, $${params.length + 3}, $${params.length + 4}, 4326)`);
        params.push(bbox[0], bbox[1], bbox[2], bbox[3]);
      }
      const predSql = buildWhereFromPredicatePg(predicate);
      if (predSql) whereParts.push(`(${predSql})`);
      if (whereSql && whereSql.trim()) {
        if (/[;]|--|\/\*/.test(whereSql)) return new Response(JSON.stringify({ error: 'where inválido' }), { status: 400 });
        whereParts.push(`(${whereSql})`);
      }
      const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
      const qualified = `${quoteIdent(schema)}.${quoteIdent(table)}`;
      const geomPropKey = String(geom || 'geom').replace(/'/g, "''");
      const sql = `SELECT COALESCE(jsonb_build_object('type','FeatureCollection','features', COALESCE(jsonb_agg(jsonb_build_object('type','Feature','geometry', ST_AsGeoJSON(${geomIdent})::jsonb,'properties', to_jsonb(t) - '${geomPropKey}')), '[]'::jsonb)), '{"type":"FeatureCollection","features":[]}'::jsonb) as fc FROM (SELECT * FROM ${qualified} ${where} LIMIT ${limit}) t;`;
      lastSql = sql; lastParams = params;
      const r = await client.query(sql, params);
      await client.end();
      const fc = r.rows?.[0]?.fc || { type: 'FeatureCollection', features: [] };
      return new Response(JSON.stringify(fc), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (kind === 'mssql') {
      const pool = await mssql.connect({
        server: conn.host || (process.env.MSSQL_HOST as string),
        port: conn.port || (process.env.MSSQL_PORT ? parseInt(process.env.MSSQL_PORT) : undefined),
        user: conn.user || (process.env.MSSQL_USER as string),
        password: conn.password || (process.env.MSSQL_PASSWORD as string),
        database: conn.database || (process.env.MSSQL_DATABASE as string),
        options: { encrypt: conn.encrypt ?? true, trustServerCertificate: conn.trustServerCertificate ?? true }
      } as any);
      const whereParts: string[] = [];
      if (bbox && bbox.length === 4 && bbox.every((v) => Number.isFinite(v))) {
        // Para SRID 4326
        whereParts.push(`${geom}.STIntersects(geometry::STGeomFromText('POLYGON((${bbox[0]} ${bbox[1]}, ${bbox[2]} ${bbox[1]}, ${bbox[2]} ${bbox[3]}, ${bbox[0]} ${bbox[3]}, ${bbox[0]} ${bbox[1]}))', 4326)) = 1`);
      }
      if (whereSql && whereSql.trim()) {
        if (/[;]|--|\/\*/.test(whereSql)) { await pool.close(); return new Response(JSON.stringify({ error: 'where inválido' }), { status: 400 }); }
        whereParts.push(`(${whereSql})`);
      }
      const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
      const q = `SELECT TOP (${limit}) *, ${geom}.STAsGeoJSON() as __geom_json FROM [${schema}].[${table}] ${where}`;
      const r = await pool.request().query(q);
      await pool.close();
      const features = (r.recordset || []).map((row: any) => {
        const g = row.__geom_json ? JSON.parse(row.__geom_json) : null;
        const props = { ...row };
        delete (props as any).__geom_json;
        return { type: 'Feature', geometry: g, properties: props };
      }).filter((f: any) => f.geometry);
      return new Response(JSON.stringify({ type: 'FeatureCollection', features }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (kind === 'mysql') {
      const connection = await mysql.createConnection({
        host: conn.host || process.env.MYSQL_HOST,
        port: conn.port || (process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : undefined),
        user: conn.user || process.env.MYSQL_USER,
        password: conn.password || process.env.MYSQL_PASSWORD,
        database: conn.database || process.env.MYSQL_DATABASE,
      });
      const whereParts: string[] = [];
      if (bbox && bbox.length === 4 && bbox.every((v) => Number.isFinite(v))) {
        whereParts.push(`ST_Intersects(${geom}, ST_PolygonFromText('POLYGON((${bbox[0]} ${bbox[1]}, ${bbox[2]} ${bbox[1]}, ${bbox[2]} ${bbox[3]}, ${bbox[0]} ${bbox[3]}, ${bbox[0]} ${bbox[1]}))', 4326))`);
      }
      if (whereSql && whereSql.trim()) {
        if (/[;]|--|\/\*/.test(whereSql)) { await conn.end(); return new Response(JSON.stringify({ error: 'where inválido' }), { status: 400 }); }
        whereParts.push(`(${whereSql})`);
      }
      const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
      const q = `SELECT *, ST_AsGeoJSON(${geom}) as __geom_json FROM \`${schema}\`.\`${table}\` ${where} LIMIT ${limit}`;
      const [rows] = await connection.query(q);
      await connection.end();
      const features = (rows as any[]).map((row: any) => {
        const g = row.__geom_json ? JSON.parse(row.__geom_json) : null;
        const props = { ...row };
        delete (props as any).__geom_json;
        return { type: 'Feature', geometry: g, properties: props };
      }).filter((f: any) => f.geometry);
      return new Response(JSON.stringify({ type: 'FeatureCollection', features }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'kind inválido' }), { status: 400 });
  } catch (e: any) {
    console.error('POST /api/db error', { error: e, lastSql, lastParams });
    const payload = {
      error: 'internal_error',
      message: e?.message || String(e),
      code: e?.code,
      detail: e?.detail,
      position: e?.position,
      lastSql,
      lastParams,
    };
    return new Response(JSON.stringify(payload), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}


