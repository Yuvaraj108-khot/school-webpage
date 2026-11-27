export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Proxy API and uploads to the live backend server
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
      const backendUrl = 'https://school-webpage-1uky.onrender.com' + url.pathname + url.search;
      const headers = new Headers(request.headers);
      headers.set('host', 'school-webpage-1uky.onrender.com');

      const proxyReq = new Request(backendUrl, {
        method: request.method,
        headers: headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'follow',
        duplex: 'half'
      });

      return fetch(proxyReq);
    }

    // Serve static frontend assets (HTML, CSS, JS, images)
    return env.ASSETS.fetch(request);
  }
};
