/**
 * Router mínimo (sem npm): método + path exato ou RegExp.
 * Handlers recebem ctx: { req, res, url, match, ...helpers }.
 */

export function createRouter() {
  const routes = [];

  function add(method, match, handler) {
    routes.push({ method: method.toUpperCase(), match, handler });
  }

  return {
    get: (match, handler) => add('GET', match, handler),
    post: (match, handler) => add('POST', match, handler),
    async dispatch(req, res, url) {
      const method = req.method?.toUpperCase();
      const pathname = url.pathname;

      for (const route of routes) {
        if (route.method !== method) continue;

        let match = null;
        if (typeof route.match === 'string') {
          if (route.match !== pathname) continue;
          match = [];
        } else if (route.match instanceof RegExp) {
          const m = pathname.match(route.match);
          if (!m) continue;
          match = m;
        } else {
          continue;
        }

        await route.handler({ req, res, url, match });
        return true;
      }
      return false;
    },
  };
}
