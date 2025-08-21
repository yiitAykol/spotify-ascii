import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies }) => {
  // tarayıcıdan GET ile test etmek istersen detay görebilesin
  const access = cookies.get('spotify_access_token') ?? null;
  const refresh = cookies.get('spotify_refresh_token') ?? null;
  return new Response(JSON.stringify({ access_exists: !!access, refresh_exists: !!refresh }), {
    headers: { 'Content-Type': 'application/json' }
  });
};

export const PUT: RequestHandler = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const access = cookies.get('spotify_access_token');
    if (!access) return new Response(JSON.stringify({ error: 'No access token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const res = await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${access}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const text = await res.text();
    // Debug için Spotify cevabını frontend'e gönder
    return new Response(JSON.stringify({ status: res.status, body: text }), {
      status: res.ok ? 200 : res.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'server_error', message: err?.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
