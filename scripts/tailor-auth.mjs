// Session check for the private tailor page. The password lives only in the TAILOR_PASSWORD
// environment variable on Netlify; the browser gets an HttpOnly cookie holding an HMAC of it.
// Changing the password signs everyone out.

export const COOKIE = 'tailor_session';
const enc = new TextEncoder();

export async function sessionToken(password) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('istihadrabbi-tailor-session-v1'));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function readCookie(req, name = COOKIE) {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

// Constant-time comparison.
export function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function isSignedIn(req, password) {
  if (!password) return false;
  return same(readCookie(req), await sessionToken(password));
}
