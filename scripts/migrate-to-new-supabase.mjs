#!/usr/bin/env node
/**
 * Tehila Bodyshop CRM — Supabase project migration
 *
 * Copies tables + storage files from OLD project to NEW project.
 * Auth users are handled separately via scripts/export-auth-users.sql
 * (generated INSERT statements pasted into the NEW project's SQL Editor).
 *
 * Usage:
 *   cd /path/to/amit-maymon-new/amit-maymon-new
 *   OLD_SUPABASE_URL=... OLD_SERVICE_ROLE_KEY=... \
 *   NEW_SUPABASE_URL=... NEW_SERVICE_ROLE_KEY=... \
 *     node scripts/migrate-to-new-supabase.mjs
 *
 * Optional env:
 *   SKIP_STORAGE=1   — skip copying storage files
 *   SKIP_TABLES=1    — skip copying table rows
 *   ONLY_TABLE=xxx   — copy only that one table (debug)
 *   DRY_RUN=1        — read-only; does not write to NEW project
 */

import { createClient } from '@supabase/supabase-js';

const { OLD_SUPABASE_URL, OLD_SERVICE_ROLE_KEY, NEW_SUPABASE_URL, NEW_SERVICE_ROLE_KEY } = process.env;
const SKIP_STORAGE = !!process.env.SKIP_STORAGE;
const SKIP_TABLES = !!process.env.SKIP_TABLES;
const ONLY_TABLE = process.env.ONLY_TABLE || null;
const DRY_RUN = !!process.env.DRY_RUN;

if (!OLD_SUPABASE_URL || !OLD_SERVICE_ROLE_KEY || !NEW_SUPABASE_URL || !NEW_SERVICE_ROLE_KEY) {
  console.error('\nMissing env. Required:');
  console.error('  OLD_SUPABASE_URL, OLD_SERVICE_ROLE_KEY');
  console.error('  NEW_SUPABASE_URL, NEW_SERVICE_ROLE_KEY');
  process.exit(1);
}

const clientOpts = { auth: { persistSession: false, autoRefreshToken: false } };
const old = createClient(OLD_SUPABASE_URL, OLD_SERVICE_ROLE_KEY, clientOpts);
const neu = createClient(NEW_SUPABASE_URL, NEW_SERVICE_ROLE_KEY, clientOpts);

// Tables in dependency order (parents first).
const TABLES = [
  'branches',
  'profiles',
  'cars',
  'cases',
  'case_workflow_runs',
  'case_workflow_steps',
  'ceo_approvals',
  'bodywork_extras',
  'case_documents',
  'notifications',
  'audit_events',
  'painter_requests',
  'painter_request_images',
  'role_permissions',
  'workflow_step_templates',
  'system_messages',
];

const BUCKETS = ['extras-images', 'painter-images', 'case-documents'];
const PAGE_SIZE = 1000;
const BATCH_SIZE = 500;

function log(...args) { console.log('[migrate]', ...args); }
function warn(...args) { console.warn('[migrate] WARN', ...args); }
function err(...args) { console.error('[migrate] ERROR', ...args); }

async function copyTable(name) {
  log(`table ${name}: reading…`);
  let from = 0, total = 0;
  while (true) {
    const { data, error } = await old.from(name).select('*').range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (/relation .* does not exist/.test(error.message) || error.code === '42P01') {
        warn(`  ${name} does not exist in OLD project, skipping`);
        return 0;
      }
      throw new Error(`read ${name}: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    total += data.length;
    if (!DRY_RUN) {
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        const { error: insErr } = await neu.from(name).upsert(batch, { onConflict: 'id' });
        if (insErr) {
          // Some tables (e.g. audit_events with jsonb) may need manual massage.
          throw new Error(`write ${name} batch @${from + i}: ${insErr.message}`);
        }
      }
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  log(`table ${name}: ${total} rows ${DRY_RUN ? '(dry-run)' : 'copied'}`);
  return total;
}

async function copyBucket(bucket) {
  log(`bucket ${bucket}: listing…`);
  // Recursively list all objects in the bucket
  async function listAll(prefix) {
    let out = [];
    let offset = 0;
    while (true) {
      const { data, error } = await old.storage.from(bucket).list(prefix, {
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) {
        if (/not found/i.test(error.message)) {
          warn(`  bucket ${bucket} not found in OLD project, skipping`);
          return [];
        }
        throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
      }
      if (!data || data.length === 0) break;
      for (const it of data) {
        // Supabase list returns files (with id/metadata) and folders (no id).
        const fullPath = prefix ? `${prefix}/${it.name}` : it.name;
        if (it.id) {
          out.push(fullPath);
        } else {
          const nested = await listAll(fullPath);
          out = out.concat(nested);
        }
      }
      if (data.length < 1000) break;
      offset += 1000;
    }
    return out;
  }

  let paths;
  try {
    paths = await listAll('');
  } catch (e) {
    warn(`  ${bucket}: ${e.message}`);
    return 0;
  }
  log(`bucket ${bucket}: ${paths.length} files`);

  let copied = 0, failed = 0;
  for (const p of paths) {
    try {
      const { data: blob, error: dlErr } = await old.storage.from(bucket).download(p);
      if (dlErr) throw dlErr;
      if (!DRY_RUN) {
        const arrayBuffer = await blob.arrayBuffer();
        const { error: upErr } = await neu.storage.from(bucket).upload(p, Buffer.from(arrayBuffer), {
          contentType: blob.type || 'application/octet-stream',
          upsert: true,
        });
        if (upErr) throw upErr;
      }
      copied++;
      if (copied % 25 === 0) log(`  ${bucket}: ${copied}/${paths.length}`);
    } catch (e) {
      failed++;
      warn(`  ${bucket}/${p}: ${e.message}`);
    }
  }
  log(`bucket ${bucket}: ${copied} copied, ${failed} failed`);
  return copied;
}

async function preflight() {
  log('preflight: checking connectivity…');
  const { error: oldErr } = await old.from('branches').select('id').limit(1);
  if (oldErr) throw new Error(`OLD connection failed: ${oldErr.message}`);
  const { error: newErr } = await neu.from('branches').select('id').limit(1);
  if (newErr) throw new Error(`NEW connection failed (did you run setup_fresh.sql?): ${newErr.message}`);
  log('preflight: OK');
}

async function main() {
  log(DRY_RUN ? 'DRY RUN — no writes will be performed' : 'LIVE migration');
  log(`OLD: ${OLD_SUPABASE_URL}`);
  log(`NEW: ${NEW_SUPABASE_URL}`);

  await preflight();

  if (!SKIP_TABLES) {
    const tables = ONLY_TABLE ? [ONLY_TABLE] : TABLES;
    for (const t of tables) {
      try { await copyTable(t); }
      catch (e) { err(`table ${t}: ${e.message}`); process.exit(2); }
    }
  }

  if (!SKIP_STORAGE && !ONLY_TABLE) {
    for (const b of BUCKETS) {
      try { await copyBucket(b); }
      catch (e) { err(`bucket ${b}: ${e.message}`); }
    }
  }

  log('DONE.');
  log('');
  log('Next steps:');
  log('  1. Run scripts/export-auth-users.sql in the OLD project SQL Editor.');
  log('  2. Copy the output → paste into NEW project SQL Editor → Run.');
  log('  3. Update .env.local and Vercel env vars to point to NEW project.');
  log('  4. Smoke-test login + a case flow.');
}

main().catch((e) => { err(e); process.exit(1); });
