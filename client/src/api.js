async function request(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  get: (url) => request(url),
  post: (url, body = {}) => request(url, 'POST', body),
  put: (url, body) => request(url, 'PUT', body),
  patch: (url, body) => request(url, 'PATCH', body),
  del: (url) => request(url, 'DELETE'),
};