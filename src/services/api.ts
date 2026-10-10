// Cliente HTTP central: toda chamada à API passa por aqui.
// Envia o token JWT e, se o servidor responder 401, encerra a sessão.

export const TOKEN_KEY = 'vancontrol_token';
export const UNAUTHORIZED_EVENT = 'vancontrol:unauthorized';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(input, { ...init, headers });

  if (response.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  return response;
}
