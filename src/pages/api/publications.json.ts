
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const runtime = locals.runtime;
  const db = runtime?.env?.DB;

  if (!db) {
    return new Response(
      JSON.stringify({ error: 'Base de données indisponible' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      },
    );
  }

  try {
    const { results } = await db
      .prepare(`
        SELECT id, title, description, content_type,
               source_url, thumbnail_url, published_at, created_at
        FROM publications
        ORDER BY created_at DESC, id DESC
      `)
      .all();

    return new Response(JSON.stringify(results), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: 'Impossible de lire les publications' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      },
    );
  }
};
