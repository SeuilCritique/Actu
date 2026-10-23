import type { APIRoute } from 'astro';
import { isAdminRequest, sameOrigin } from '../../../lib/admin-auth';

export const prerender = false;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function getContext(locals: App.Locals) {
  const env = (locals as any).runtime?.env;
  const secret = env?.ADMIN_PASSWORD as string | undefined;
  const db = env?.DB;
  return { secret, db };
}

async function authorized(request: Request, secret?: string) {
  return Boolean(secret && await isAdminRequest(request, secret));
}

export const GET: APIRoute = async ({ request, locals }) => {
  const { secret, db } = await getContext(locals);
  if (!(await authorized(request, secret))) return json({ error: 'Authentification requise.' }, 401);
  if (!db) return json({ error: 'Base de données indisponible.' }, 503);
  try {
    const { results } = await db.prepare(`SELECT id, title, description, content_type, source_url, thumbnail_url, published_at, created_at FROM publications ORDER BY published_at DESC, id DESC`).all();
    return json(results);
  } catch {
    return json({ error: 'Impossible de lire les publications.' }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const { secret, db } = await getContext(locals);
  if (!sameOrigin(request)) return json({ error: 'Origine non autorisée.' }, 403);
  if (!(await authorized(request, secret))) return json({ error: 'Authentification requise.' }, 401);
  if (!db) return json({ error: 'Base de données indisponible.' }, 503);

  let item: any;
  try { item = await request.json(); } catch { return json({ error: 'Données invalides.' }, 400); }
  const validation = validate(item);
  if (validation) return json({ error: validation }, 400);

  try {
    const result = await db.prepare(`INSERT INTO publications (title, description, content_type, source_url, thumbnail_url, published_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(item.title.trim(), item.description.trim(), item.content_type, item.source_url.trim(), item.thumbnail_url.trim(), item.published_at || new Date().toISOString().slice(0, 19).replace('T', ' ')).run();
    return json({ ok: true, id: result.meta?.last_row_id }, 201);
  } catch {
    return json({ error: 'Impossible d’enregistrer la publication.' }, 500);
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const { secret, db } = await getContext(locals);
  if (!sameOrigin(request)) return json({ error: 'Origine non autorisée.' }, 403);
  if (!(await authorized(request, secret))) return json({ error: 'Authentification requise.' }, 401);
  if (!db) return json({ error: 'Base de données indisponible.' }, 503);

  let item: any;
  try { item = await request.json(); } catch { return json({ error: 'Données invalides.' }, 400); }
  if (!Number.isInteger(item.id) || item.id < 1) return json({ error: 'Identifiant invalide.' }, 400);
  const validation = validate(item);
  if (validation) return json({ error: validation }, 400);

  try {
    const result = await db.prepare(`UPDATE publications SET title = ?, description = ?, content_type = ?, source_url = ?, thumbnail_url = ?, published_at = ? WHERE id = ?`)
      .bind(item.title.trim(), item.description.trim(), item.content_type, item.source_url.trim(), item.thumbnail_url.trim(), item.published_at || new Date().toISOString().slice(0, 19).replace('T', ' '), item.id).run();
    if (!result.meta?.changes) return json({ error: 'Publication introuvable.' }, 404);
    return json({ ok: true });
  } catch {
    return json({ error: 'Impossible de modifier la publication.' }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const { secret, db } = await getContext(locals);
  if (!sameOrigin(request)) return json({ error: 'Origine non autorisée.' }, 403);
  if (!(await authorized(request, secret))) return json({ error: 'Authentification requise.' }, 401);
  if (!db) return json({ error: 'Base de données indisponible.' }, 503);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Données invalides.' }, 400); }
  if (!Number.isInteger(body.id) || body.id < 1) return json({ error: 'Identifiant invalide.' }, 400);
  try {
    const result = await db.prepare('DELETE FROM publications WHERE id = ?').bind(body.id).run();
    if (!result.meta?.changes) return json({ error: 'Publication introuvable.' }, 404);
    return json({ ok: true });
  } catch {
    return json({ error: 'Impossible de supprimer la publication.' }, 500);
  }
};

function validate(item: any): string | null {
  if (!item || typeof item !== 'object') return 'Données invalides.';
  if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 200) return 'Le titre est obligatoire (200 caractères maximum).';
  if (typeof item.description !== 'string' || item.description.length > 2000) return 'Description trop longue (2 000 caractères maximum).';
  if (!['image', 'video', 'article'].includes(item.content_type)) return 'Type de contenu invalide.';
  if (typeof item.source_url !== 'string' || !validHttpUrl(item.source_url)) return 'L’URL source doit être une adresse HTTP ou HTTPS valide.';
  if (typeof item.thumbnail_url !== 'string' || (item.thumbnail_url.trim() && !validHttpUrl(item.thumbnail_url))) return 'L’URL de miniature doit être vide ou une adresse HTTP(S) valide.';
  if (item.published_at && (typeof item.published_at !== 'string' || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(item.published_at))) return 'Date invalide.';
  return null;
}

function validHttpUrl(value: string): boolean {
  try { const url = new URL(value.trim()); return (url.protocol === 'https:' || url.protocol === 'http:') && value.trim().length <= 2048; }
  catch { return false; }
}
