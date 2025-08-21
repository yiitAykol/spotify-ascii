import type { RequestHandler } from '@sveltejs/kit';
//import { PUBLIC_SPOTIFY_CLIENT_ID } from '$env/static/public';
import { SPOTIFY_CLIENT_ID } from '$env/static/private';
async function refreshAccessToken(refresh_token: string) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token,
    client_id: SPOTIFY_CLIENT_ID
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!res.ok) throw new Error('Failed to refresh token');
  return res.json();
}

export const GET: RequestHandler = async ({ cookies }) => {
  const access = cookies.get('spotify_access_token');
  const refresh = cookies.get('spotify_refresh_token');

  if (access) {
    return new Response(JSON.stringify({ access_token: access }), { headers: { 'Content-Type': 'application/json' } });
  }

  if (refresh) {
    try {
      const data = await refreshAccessToken(refresh);
      // set new access token cookie
      cookies.set('spotify_access_token', data.access_token, {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: data.expires_in
      });
      // refresh_token sometimes returned, update if present
      if (data.refresh_token) {
        cookies.set('spotify_refresh_token', data.refresh_token, {
          httpOnly: true,
          path: '/',
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: 60 * 60 * 24 * 30
        });
      }
      return new Response(JSON.stringify({ access_token: data.access_token }), { headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      return new Response('Failed to refresh', { status: 401 });
    }
  }

  return new Response('No tokens', { status: 401 });
};
