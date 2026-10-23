import type { APIRoute } from 'astro';
import { createAdminCookie, clearAdminCookie, isAdminRequest, sameOrigin } from '../../../lib/admin-auth';

export const prerender = false;

type CloudflareEnv = {
  ADMIN_PASSWORD?: string;
};

function getAdminPassword(locals: unknown): string | undefined {
  const localData = locals as {
    runtime?: { env?: CloudflareEnv };
    env?: CloudflareEnv;
  };

  // Astro 5 + @astrojs/cloudflare commonly exposes bindings via locals.runtime.env.
  const runtimeSecret = localData?.runtime?.env?.ADMIN_PASSWORD;
  if (typeof runtimeSecret === 'string' && runtimeSecret.length > 0) {
    return runtimeSecret;
  }

  // Some Worker runtimes expose bindings through process.env when
  // nodejs_compat_populate_process_env is enabled.
  const processSecret = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env?.ADMIN_PASSWORD;

  if (typeof processSecret === 'string' && processSecret.length > 0) {
    return processSecret;
  }

  // Support runtimes that attach the environment directly to locals.
  const directSecret = localData?.env?.ADMIN_PASSWORD;
  if (typeof directSecret === 'string' && directSecret.length > 0) {
    return directSecret;
  }

  return undefined;
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

export const POST: APIRoute = async ({ request, locals }) => {
  const secret = getAdminPassword(locals);

  if (!secret) {
    return jsonError(
      'Le secret ADMIN_PASSWORD est introuvable dans l’environnement du Worker. Vérifiez que le secret est configuré sur le Worker de production qui sert ce site, puis redéployez.',
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

export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });

  const secret = getAdminPassword(locals);
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
