import type { APIRoute } from 'astro';
import { createAdminCookie, clearAdminCookie, isAdminRequest, sameOrigin } from '../../../lib/admin-auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env;
  const secret = env?.ADMIN_PASSWORD as string | undefined;
  if (!secret) return new Response(JSON.stringify({ error: 'Le secret ADMIN_PASSWORD n’est pas configuré.' }), { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  if (!sameOrigin(request)) return new Response(JSON.stringify({ error: 'Origine non autorisée.' }), { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

  let body: { password?: unknown };
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Requête invalide.' }), { status: 400 }); }
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length > 1024 || password !== secret) {
    return new Response(JSON.stringify({ error: 'Mot de passe incorrect.' }), { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': await createAdminCookie(secret) },
  });
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const secret = (locals as any).runtime?.env?.ADMIN_PASSWORD as string | undefined;
  if (!secret || !(await isAdminRequest(request, secret))) return new Response(null, { status: 401 });
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': clearAdminCookie(), 'Cache-Control': 'no-store' } });
};
