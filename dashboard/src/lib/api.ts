const getApiKey = () => localStorage.getItem("geminitro_api_key") ?? "geminitro";

export const api = {
  get: (path: string, options?: { params?: Record<string, string> }) => {
    let url = path;
    if (options?.params) {
      const searchParams = new URLSearchParams(options.params);
      url = `${path}?${searchParams.toString()}`;
    }
    return fetch(url, { headers: { Authorization: `Bearer ${getApiKey()}` } }).then((r) =>
      r.json(),
    );
  },

  post: (path: string, body: unknown) =>
    fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getApiKey()}` },
      body: JSON.stringify(body),
    }).then((r) => r.json()),

  delete: (path: string) =>
    fetch(path, { method: "DELETE", headers: { Authorization: `Bearer ${getApiKey()}` } }).then(
      (r) => r.json(),
    ),
};
