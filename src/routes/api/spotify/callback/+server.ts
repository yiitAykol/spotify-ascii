import type { RequestHandler } from '@sveltejs/kit';

import { SPOTIFY_REDIRECT_URI } from '$env/static/private';
import { SPOTIFY_CLIENT_ID } from '$env/static/private';


export const GET: RequestHandler = async ({ url, cookies }) => {
  try {
    const code = url.searchParams.get('code');
    const errorParam = url.searchParams.get('error');
    if (errorParam) {
      // Kullanıcı izin vermediyse veya Spotify hata döndürdüyse
      return new Response(JSON.stringify({ error: errorParam }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (!code) {
      return new Response(JSON.stringify({ error: 'Missing code in callback URL' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const verifier = cookies.get('spotify_code_verifier');
    if (!verifier) {
      return new Response(JSON.stringify({ error: 'Missing code verifier cookie' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      client_id: SPOTIFY_CLIENT_ID,
      code_verifier: verifier
    });

    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const text = await tokenRes.text();
    if (!tokenRes.ok) {
      // Spotify genelde JSON hata döner; burada hem status hem body döndürüyoruz
      return new Response(
        JSON.stringify({ error: 'Token exchange failed', status: tokenRes.status, body: text }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // tokenRes.ok ise response JSON olmalı
    let tokenData;
    try {
      tokenData = JSON.parse(text);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON from token endpoint', body: text }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // tokenData: { access_token, token_type, scope, expires_in, refresh_token }
    if (!tokenData.access_token) {
      return new Response(JSON.stringify({ error: 'No access_token in response', body: tokenData }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // Set httpOnly cookies for tokens
    const inProduction = process.env.NODE_ENV === 'production';
    cookies.set('spotify_access_token', tokenData.access_token, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: inProduction,
      maxAge: typeof tokenData.expires_in === 'number' ? tokenData.expires_in : 3600
    });

    if (tokenData.refresh_token) {
      cookies.set('spotify_refresh_token', tokenData.refresh_token, {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: inProduction,
        maxAge: 60 * 60 * 24 * 30 // 30 days
      });
    }

    // Clear verifier cookie - artık ihtiyaç yok
    cookies.delete('spotify_code_verifier', { path: '/' });

    // Redirect to a client route. Ek bilgi istersen query string ekleyebilirsin
    return new Response(null, { status: 302, headers: { Location: '/?spotify_auth=success' } });
  } catch (err: any) {
    // Genel catch - beklenmedik hata varsa döndür
    return new Response(JSON.stringify({ error: 'Server error', message: err?.message ?? String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
