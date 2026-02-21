const getApiKey = () => localStorage.getItem('geminitro_api_key') ?? 'geminitro'

export const api = {
  get: (path: string) =>
    fetch(path, { headers: { Authorization: `Bearer ${getApiKey()}` } }).then(r => r.json()),

  post: (path: string, body: unknown) =>
    fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getApiKey()}` },
      body: JSON.stringify(body),
    }).then(r => r.json()),

  delete: (path: string) =>
    fetch(path, { method: 'DELETE', headers: { Authorization: `Bearer ${getApiKey()}` } }).then(r => r.json()),
}
