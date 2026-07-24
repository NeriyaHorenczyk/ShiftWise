// Client-side JWT expiry check only — the signature is never (and can't be)
// verified here without the server's secret. This exists purely so the UI
// can react to an obviously-stale token immediately (no page content flash,
// no waiting on a network round-trip); the backend's own signature/expiry
// check on every request remains the actual security boundary.
export const isTokenExpired = (token) => {
  if (!token) return true;

  const parts = token.split('.');
  if (parts.length !== 3) return true;

  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.exp) return true;
    return payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
};
