/**
 * Gera `leads-site/public/demo/demostração-lead-rapido.csv` com até 50 leads
 * da tabela `leadrapido`. Inclui linhas com **email válido OU** URL http(s)
 * (site / website / url) — não exige os dois. Cabeçalho e ordem das colunas
 * seguem `HEADERS` (igual à entrega CSV da API ao cliente); saída ordenada por segmento, estado e nome (pt-BR).
 *
 * Uso (na pasta leads-api, com .env configurado):
 *   npm run export-demo-csv
 *
 * Requer: DATABASE_URL (ou PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE)
 */

import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEMO_CSV = path.join(
  REPO_ROOT,
  'leads-site',
  'public',
  'demo',
  'demostração-lead-rapido.csv'
);

const TARGET_TOTAL = 50;
const PAGE_SIZE = 1000;
const MAX_ROWS_SCAN_PER_SEGMENT = 50000;
const DELIM = ';';

const HEADERS = [
  'estado',
  'segmento',
  'nome',
  'whatsapp',
  'telefone',
  'email',
  'website',
  'endereco',
  'cidade',
  'cep',
  'telefone_e164',
  'url',
];

/** Igual a `normalizeLeadrapidoSegment` na API (pt-BR). */
function normalizeSegment(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return s;
  return s
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLocaleLowerCase('pt-BR');
      if (!lower) return word;
      return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
    })
    .join(' ');
}

function escapeForIlikeContains(value) {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function parseSegmentsFromDemo(csvPath) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Ficheiro demo não encontrado: ${csvPath}`);
  }
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error('CSV demo sem linhas de dados.');
  const segs = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(DELIM);
    const seg = (cols[1] ?? '').trim();
    if (seg) segs.add(seg);
  }
  return [...segs];
}

function mergePayload(row) {
  const flat = { ...row };
  const p = row.payload;
  if (p !== null && typeof p === 'object' && !Array.isArray(p)) {
    for (const [k, v] of Object.entries(p)) {
      const lk = k.toLowerCase();
      if (lk === 'id' || lk === 'place_id') continue;
      const cur = flat[k];
      if (cur === null || cur === undefined || String(cur).trim() === '') {
        flat[k] = v;
      }
    }
  }
  return flat;
}

function pick(flat, ...keys) {
  for (const k of keys) {
    if (flat[k] !== null && flat[k] !== undefined && String(flat[k]).trim() !== '') {
      return flat[k];
    }
    const found = Object.keys(flat).find((x) => x.toLowerCase() === k.toLowerCase());
    if (found !== undefined && flat[found] !== null && flat[found] !== undefined) {
      const s = String(flat[found]).trim();
      if (s !== '') return flat[found];
    }
  }
  return '';
}

function firstHttpUrl(m) {
  const keys = ['site', 'website', 'url', 'web_site', 'maps_url', 'google_maps_url'];
  for (const k of keys) {
    const v = String(pick(m, k) ?? '').trim();
    if (/^https?:\/\//i.test(v)) return v;
  }
  return '';
}

function hasValidEmail(m) {
  const email = String(pick(m, 'email', 'mail', 'e_mail') ?? '').trim();
  return Boolean(email && email.includes('@'));
}

/** Email válido OU pelo menos uma URL http(s) em site/website/url. */
function isEligibleLead(row) {
  const m = mergePayload(row);
  return hasValidEmail(m) || Boolean(firstHttpUrl(m));
}

function scoreLead(row) {
  const m = mergePayload(row);
  let s = 0;
  if (hasValidEmail(m)) s += 2;
  if (firstHttpUrl(m)) s += 2;
  if (String(pick(m, 'whatsapp')).trim()) s += 2;
  if (String(pick(m, 'telefone')).trim()) s += 2;
  if (String(pick(m, 'telefone_e164')).trim()) s += 1;
  if (String(pick(m, 'cidade')).trim()) s += 1;
  if (String(pick(m, 'endereco', 'endereço')).trim()) s += 1;
  return s;
}

function excelLongNumberCell(v) {
  const raw = String(v ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 11 && /^\d+$/.test(digits)) {
    return `="${digits}"`;
  }
  return raw;
}

function toCsvRow(flat) {
  const m = mergePayload(flat);
  return {
    estado: pick(m, 'estado'),
    segmento: pick(m, 'segmento'),
    nome: pick(m, 'nome', 'nome_empresa'),
    whatsapp: excelLongNumberCell(pick(m, 'whatsapp')),
    telefone: pick(m, 'telefone'),
    email: pick(m, 'email', 'mail', 'e_mail'),
    website: pick(m, 'website', 'web_site', 'site'),
    endereco: pick(m, 'endereco', 'endereço'),
    cidade: pick(m, 'cidade'),
    cep: pick(m, 'cep', 'codigo_postal'),
    telefone_e164: excelLongNumberCell(pick(m, 'telefone_e164', 'phone_e164', 'tel_e164', 'whatsapp_e164')),
    url: pick(m, 'url', 'maps_url', 'google_maps_url'),
  };
}

function escapeCsvCell(v) {
  const t = String(v ?? '');
  if (/["\n\r]/.test(t) || t.includes(DELIM)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function rowObjectToLine(obj) {
  return HEADERS.map((h) => escapeCsvCell(obj[h])).join(DELIM);
}

function allocateQuotas(nSeg, total) {
  if (nSeg === 0) return [];
  const base = Math.floor(total / nSeg);
  const extra = total % nSeg;
  const q = [];
  for (let i = 0; i < nSeg; i++) q.push(base + (i < extra ? 1 : 0));
  return q;
}

/**
 * Busca por segmento: ILIKE contém texto (underscore escapado), depois filtra
 * com a mesma normalização pt-BR da API.
 */
async function fetchPool(pool, segmentLabel) {
  const wantNorm = normalizeSegment(segmentLabel);
  const pattern = `%${escapeForIlikeContains(segmentLabel)}%`;
  const byId = new Map();

  for (let from = 0; from < MAX_ROWS_SCAN_PER_SEGMENT; from += PAGE_SIZE) {
    const { rows } = await pool.query(
      `SELECT *
       FROM public.leadrapido
       WHERE segmento ILIKE $1 ESCAPE '\\'
       ORDER BY id
       LIMIT $2 OFFSET $3`,
      [pattern, PAGE_SIZE, from]
    );
    if (!rows?.length) break;

    for (const row of rows) {
      if (normalizeSegment(row.segmento) !== wantNorm) continue;
      const id = row.id ?? row.place_id;
      if (id !== undefined && id !== null) byId.set(String(id), row);
    }

    if (rows.length < PAGE_SIZE) break;
  }

  const rows = [...byId.values()];
  return rows.filter(isEligibleLead).sort((a, b) => scoreLead(b) - scoreLead(a));
}

/** Ordem final do CSV: segmento → estado → nome (pt-BR). */
function sortRowsForCsvOutput(rows) {
  const key = (row, ...pickKeys) => {
    const m = mergePayload(row);
    let s = '';
    for (const k of pickKeys) {
      s = String(pick(m, k) ?? '').trim();
      if (s) break;
    }
    return s.toLocaleLowerCase('pt-BR');
  };
  return [...rows].sort((a, b) => {
    const c0 = normalizeSegment(key(a, 'segmento')).localeCompare(
      normalizeSegment(key(b, 'segmento')),
      'pt-BR',
      { sensitivity: 'base' }
    );
    if (c0 !== 0) return c0;
    const c1 = key(a, 'estado').localeCompare(key(b, 'estado'), 'pt-BR', { sensitivity: 'base' });
    if (c1 !== 0) return c1;
    return key(a, 'nome', 'nome_empresa').localeCompare(key(b, 'nome', 'nome_empresa'), 'pt-BR', {
      sensitivity: 'base',
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Evita EBUSY no Windows quando o CSV está aberto no editor: grava .tmp e renomeia com novas tentativas.
 */
/** @returns {Promise<string>} caminho final do CSV gravado */
async function writeCsvAtomically(destPath, content) {
  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(destPath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, content, 'utf8');

  let lastErr;
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      try {
        fs.unlinkSync(destPath);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      fs.renameSync(tmp, destPath);
      return destPath;
    } catch (e) {
      lastErr = e;
      if (e.code === 'EBUSY' || e.code === 'EPERM') {
        console.warn(
          `Ficheiro bloqueado (tentativa ${attempt}/12). Feche o CSV no Cursor/Excel e aguarde… (${e.code})`
        );
        await sleep(500);
        continue;
      }
      break;
    }
  }

  const fallback = destPath.replace(/\.csv$/i, '') + '.gerado.csv';
  try {
    fs.copyFileSync(tmp, fallback);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch (_) {}
  }
  console.warn(
    `O ficheiro original está bloqueado. CSV gravado em:\n  ${fallback}\n(Feche "${path.basename(destPath)}" e copie ou volte a correr o script.)`
  );
  return fallback;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL?.trim();
  const pool = dbUrl
    ? new Pool({ connectionString: dbUrl })
    : new Pool({
        host: process.env.PGHOST?.trim() || '127.0.0.1',
        port: parseInt(process.env.PGPORT || '5432', 10),
        user: process.env.PGUSER?.trim() || 'postgres',
        password: process.env.PGPASSWORD ?? '',
        database: process.env.PGDATABASE?.trim() || 'postgres',
      });

  const segments = parseSegmentsFromDemo(DEMO_CSV);
  console.log('Segmentos no demo:', segments.join(' | '));

  const sampleSegs = await pool.query(
    `SELECT segmento
     FROM public.leadrapido
     WHERE segmento IS NOT NULL
     LIMIT 500`
  );
  if (sampleSegs.rows?.length) {
    const uniq = [...new Set(sampleSegs.rows.map((r) => String(r.segmento).trim()))].slice(0, 25);
    console.log('Amostra de segmento na base:', uniq.join(' | '));
  }

  const pools = [];
  for (const seg of segments) {
    const leads = await fetchPool(pool, seg);
    console.log(`  "${seg}": ${leads.length} leads (email OU URL http(s))`);
    pools.push({ seg, rows: leads });
  }

  const quotas = allocateQuotas(segments.length, TARGET_TOTAL);
  const usedPlaceIds = new Set();
  const chosen = [];

  for (let i = 0; i < pools.length; i++) {
    const want = quotas[i];
    let n = 0;
    for (const r of pools[i].rows) {
      if (n >= want) break;
      const pid = String(r.place_id ?? '');
      if (!pid || usedPlaceIds.has(pid)) continue;
      usedPlaceIds.add(pid);
      chosen.push(r);
      n++;
    }
  }

  let guard = 0;
  while (chosen.length < TARGET_TOTAL && guard < 5000) {
    guard++;
    let added = false;
    for (const pool of pools) {
      if (chosen.length >= TARGET_TOTAL) break;
      const next = pool.rows.find((r) => {
        const pid = String(r.place_id ?? '');
        return pid && !usedPlaceIds.has(pid);
      });
      if (next) {
        usedPlaceIds.add(String(next.place_id));
        chosen.push(next);
        added = true;
      }
    }
    if (!added) break;
  }

  if (chosen.length < TARGET_TOTAL) {
    console.warn(`Aviso: só ${chosen.length} leads elegíveis disponíveis (meta ${TARGET_TOTAL}).`);
  }

  const ordered = sortRowsForCsvOutput(chosen);

  const bom = '\uFEFF';
  const lines = [HEADERS.join(DELIM)];
  for (const row of ordered) {
    lines.push(rowObjectToLine(toCsvRow(row)));
  }

  const body = bom + lines.join('\n') + '\n';
  const outPath = await writeCsvAtomically(DEMO_CSV, body);
  console.log(`Escrito ${ordered.length} linhas (ordenadas) em:\n  ${outPath}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
