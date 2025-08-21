// GET /api/spotify/current
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ cookies }) => {
  const token = cookies.get('spotify_access_token'); // 👈 burası önemli
  if (!token) return new Response('Unauthorized', { status: 401 });

  const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  return new Response(await res.text(), { status: res.status });
};
