import type { RequestHandler } from '@sveltejs/kit';
import { randomBytes, createHash } from 'crypto';
import { SPOTIFY_CLIENT_ID } from '$env/static/private';
import { SPOTIFY_REDIRECT_URI } from '$env/static/private';

function base64url(buffer: Buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function generateCodeVerifier() {
  return base64url(randomBytes(64));
}
function createCodeChallenge(verifier: string) {
  return base64url(createHash('sha256').update(verifier).digest());
}

export const GET: RequestHandler = async ({ cookies }) => {
  const verifier = generateCodeVerifier();
  const challenge = createCodeChallenge(verifier);

  // store verifier server-side in httpOnly cookie (for later exchange)
  cookies.set('spotify_code_verifier', verifier, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 300 // short-lived (5min)
  });

  const scope = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state'
  ].join(' ');

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope
  });

  return new Response(null, {
    status: 302,
    headers: { Location: `https://accounts.spotify.com/authorize?${params.toString()}` }
  });
};
