// src/routes/api/spotify/transfer/+server.ts
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ request, cookies }) => {
  const { device_id } = await request.json();
  const access = cookies.get('spotify_access_token');
  if (!access) return new Response(JSON.stringify({ error: 'No access token' }), { status: 401, headers: {'Content-Type':'application/json'} });

  const res = await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: [device_id], play: false })
  });
  const text = await res.text();
  return new Response(JSON.stringify({ status: res.status, body: text }), { status: res.ok ? 200 : res.status, headers: {'Content-Type':'application/json'} });
};
