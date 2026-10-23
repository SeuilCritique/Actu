import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  createAdminCookie,
  clearAdminCookie,
  isAdminRequest,
  sameOrigin,
} from '../../../lib/admin-auth';

export const prerender = false;

function getAdminPassword(): string | undefined {
  const value = env.ADMIN_PASSWORD;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const secret = getAdminPassword();

  if (!secret) {
    return jsonError(
      'Le secret ADMIN_PASSWORD est introuvable dans l’environnement du Worker. Vérifiez le secret et le dernier déploiement.',
      503,
    );
  }

  if (!sameOrigin(request)) {
    return jsonError('Origine non autorisée.', 403);
  }

  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError('Requête invalide.', 400);
  }

  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length > 1024 || password !== secret) {
    return jsonError('Mot de passe incorrect.', 401);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': await createAdminCookie(secret),
    },
  });
};

export const DELETE: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });

  const secret = getAdminPassword();
  if (!secret || !(await isAdminRequest(request, secret))) {
    return new Response(null, { status: 401 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': clearAdminCookie(),
      'Cache-Control': 'no-store',
    },
  });
};
