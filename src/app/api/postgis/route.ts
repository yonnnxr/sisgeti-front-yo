import { NextRequest } from 'next/server';
import { Client } from 'pg';

// Variáveis de ambiente esperadas (configurar no .env.local sem comitar em produção)
// PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const schema: string = (body.schema || 'public');
    const table: string = body.table;
    const geomColumn: string = (body.geomColumn || 'geom');
    const properties: string[] | undefined = body.properties;
    const bbox: [number, number, number, number] | undefined = body.bbox;
    const whereSql: string | undefined = typeof body.where === 'string' ? body.where : (typeof body.pgWhere === 'string' ? body.pgWhere : undefined);
    const limit: number = Math.max(1, Math.min(100000, Number(body.limit) || 100000));
    if (!table) return new Response(JSON.stringify({ error: 'table é obrigatório' }), { status: 400 });

    // Montar SELECT
    const cols = Array.isArray(properties) && properties.length > 0
      ? properties.map(c => c.replace(/[^a-zA-Z0-9_]/g, '')).join(', ')
      : '*';
    const geom = `${geomColumn.replace(/[^a-zA-Z0-9_]/g, '')}`;
    const qualified = `${schema.replace(/[^a-zA-Z0-9_]/g, '')}.${table.replace(/[^a-zA-Z0-9_]/g, '')}`;

    const whereParts: string[] = [];
    const params: any[] = [];
    if (bbox && bbox.length === 4 && bbox.every((v) => Number.isFinite(v))) {
      whereParts.push(`${geom} && ST_MakeEnvelope($${params.length + 1}, $${params.length + 2}, $${params.length + 3}, $${params.length + 4}, 4326)`);
      params.push(bbox[0], bbox[1], bbox[2], bbox[3]);
    }
    if (whereSql && whereSql.trim()) {
      // sanitização simples para evitar comandos perigosos
      if (/[;]|--|\/\*/.test(whereSql)) {
        return new Response(JSON.stringify({ error: 'where inválido' }), { status: 400 });
      }
      whereParts.push(`(${whereSql})`);
    }
    const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const sql = `SELECT COALESCE(jsonb_build_object(
      'type','FeatureCollection',
      'features', COALESCE(jsonb_agg(jsonb_build_object(
        'type','Feature',
        'geometry', ST_AsGeoJSON(${geom})::jsonb,
        'properties', to_jsonb(t) - '${geom}'
      )), '[]'::jsonb)
    ), '{"type":"FeatureCollection","features":[]}'::jsonb) as fc
    FROM (
      SELECT ${cols}, ${geom}
      FROM ${qualified}
      ${where}
      LIMIT ${limit}
    ) t;`;

    const client = new Client();
    await client.connect();
    const r = await client.query(sql, params);
    await client.end();
    const fc = r.rows?.[0]?.fc || { type: 'FeatureCollection', features: [] };
    return new Response(JSON.stringify(fc), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('API /api/postgis error:', e);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const catalog = url.searchParams.get('catalog');
    if (!catalog) return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const client = new Client();
    await client.connect();
    const q = `SELECT f_table_schema as schema, f_table_name as table, f_geometry_column as geom, srid, type
               FROM geometry_columns
               ORDER BY f_table_schema, f_table_name`;
    const r = await client.query(q);
    await client.end();
    return new Response(JSON.stringify({ tables: r.rows }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('API /api/postgis GET error:', e);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
  }
}


