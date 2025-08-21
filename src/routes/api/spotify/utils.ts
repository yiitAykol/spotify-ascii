import type { Cookies } from '@sveltejs/kit';

export function getAccessTokenFromCookies(cookies: Cookies): string | null {
  return cookies.get('spotify_access_token') ?? null;
}
