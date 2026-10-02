import { Request, Response, NextFunction, Router } from 'express';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { serviceManager } from './serviceManager.js';
import { DetectedService, isDocker } from './serviceDiscovery.js';

/**
 * Scoped development proxy for the embedded browser.
 *
 * Purpose:
 * 1. Strips X-Frame-Options and CSP frame-ancestors headers so dev apps can be
 *    loaded inside the editor's iframe.
 * 2. Rewrites redirect Location headers so navigation stays within the proxy.
 * 3. Rewrites and forwards cookies, injecting editor_preview_service so subresource
 *    requests (/static/*, /_next/*) can be routed to the correct service.
 * 4. Proxies static asset fallbacks for absolute paths in HTML.
 * 5. Supports WebSocket upgrades for HMR/live-reload across Next.js, Vite, etc.
 * 6. Scoped strictly to registered workspace services (SSRF-safe).
 */

const HEADERS_TO_STRIP = [
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
];

const RESERVED_BACKEND_PREFIXES = [
  '/browser',
  '/workspace',
  '/files',
  '/file-content',
  '/intent',
  '/format',
  '/formatters',
  '/ai',
  '/port',
  '/dev-proxy',
  '/preview',
  '/socket.io',
];

/**
 * Build the proxy router.
 * @param mountPrefix e.g. '/preview' or '/dev-proxy'
 */
export function createDevProxyRouter(mountPrefix = '/preview'): Router {
  const router = Router();

  // Redirect root /:serviceId without trailing slash to /:serviceId/
  // to ensure relative links in documents resolve correctly
  router.get('/:serviceId', (req: Request, res: Response, next: NextFunction) => {
    const rawUrl = req.originalUrl || req.url;
    const urlWithoutQuery = rawUrl.split('?')[0];
    const query = rawUrl.includes('?') ? '?' + rawUrl.split('?').slice(1).join('?') : '';
    
    if (urlWithoutQuery.endsWith(`/${req.params.serviceId}`)) {
      return res.redirect(302, `${urlWithoutQuery}/${query}`);
    }
    next();
  });

  // Proxy by service ID: matches /:serviceId and /:serviceId/*
  router.use('/:serviceId', (req: Request, res: Response) => {
    const { serviceId } = req.params;
    const service = serviceManager.getService(serviceId);

    if (!service) {
      res.status(404).json({ error: `Service "${serviceId}" not found or not running` });
      return;
    }

    if (service.status !== 'running' && service.status !== 'starting') {
      res.status(503).json({
        error: 'Service is not available',
        status: service.status,
        name: service.name,
      });
      return;
    }

    // req.url inside router.use('/:serviceId') starts after /:serviceId
    const subPath = req.url || '/';
    forwardRequestToService(req, res, service, subPath, mountPrefix);
  });

  return router;
}

/**
 * Forward an HTTP request to the target service.
 */
function forwardRequestToService(
  req: Request,
  res: Response,
  service: DetectedService,
  targetPath: string,
  mountPrefix: string,
  retryWithHostDockerInternal = false
): void {
  // Determine hostname to connect to
  let targetHostname = service.targetHost || (service.host === 'localhost' ? '127.0.0.1' : service.host);
  if (retryWithHostDockerInternal && isDocker) {
    targetHostname = 'host.docker.internal';
  }

  const isHttps = service.protocol === 'https';
  const client = isHttps ? https : http;

  // Build target URL
  const targetBase = `${service.protocol}://${targetHostname}:${service.port}`;
  const cleanPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(cleanPath, targetBase);
  } catch {
    parsedUrl = new URL('/', targetBase);
  }

  // Forward headers, adjusting Host, Origin, and Referer
  const forwardHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    if (typeof value === 'string') {
      forwardHeaders[key] = value;
    } else if (Array.isArray(value)) {
      forwardHeaders[key] = value.join(', ');
    }
  }

  // Set Host header to localhost:<port> for dev frameworks that validate host
  const hostHeader = (service.host === '127.0.0.1' || service.host === '0.0.0.0' || service.host === 'localhost')
    ? `localhost:${service.port}`
    : `${service.host}:${service.port}`;
  forwardHeaders['host'] = hostHeader;

  // Adjust Origin to match target service so CSRF/CORS in Django/Next.js pass
  if (forwardHeaders['origin']) {
    forwardHeaders['origin'] = `${service.protocol}://${hostHeader}`;
  }

  // Adjust Referer if it refers to the proxy
  if (forwardHeaders['referer']) {
    try {
      const refUrl = new URL(forwardHeaders['referer']);
      forwardHeaders['referer'] = `${service.protocol}://${hostHeader}${refUrl.pathname}${refUrl.search}`;
    } catch {
      delete forwardHeaders['referer'];
    }
  }

  // Standard proxy forwarding headers
  forwardHeaders['x-forwarded-host'] = req.headers['host'] || 'localhost:5001';
  forwardHeaders['x-forwarded-proto'] = req.protocol || 'http';
  if (req.ip) {
    forwardHeaders['x-forwarded-for'] = req.ip;
  }

  const options: http.RequestOptions = {
    hostname: targetHostname,
    port: service.port,
    path: parsedUrl.pathname + parsedUrl.search,
    method: req.method,
    headers: forwardHeaders,
    timeout: 30000,
    rejectUnauthorized: false,
  };

  try {
    const proxyReq = client.request(options, (proxyRes) => {
      const statusCode = proxyRes.statusCode || 502;

      // Filter and modify response headers
      const responseHeaders: Record<string, string | string[]> = {};
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (!value) continue;

        const lowerKey = key.toLowerCase();

        // Strip iframe-blocking headers
        if (HEADERS_TO_STRIP.includes(lowerKey)) {
          continue;
        }

        // Clean CSP frame-ancestors
        if (lowerKey === 'content-security-policy') {
          const cspValue = typeof value === 'string' ? value : value.join('; ');
          const modified = cspValue
            .replace(/frame-ancestors\s+[^;]+;?/gi, '')
            .trim();
          if (modified) {
            responseHeaders[key] = modified;
          }
          continue;
        }

        responseHeaders[key] = value as string | string[];
      }

      // Rewrite Location header for redirects (301, 302, 303, 307, 308)
      const rawLocation = proxyRes.headers['location'];
      if (rawLocation) {
        let newLocation = rawLocation;
        try {
          if (rawLocation.startsWith('/')) {
            newLocation = `${mountPrefix}/${service.id}${rawLocation}`;
          } else {
            const locUrl = new URL(rawLocation);
            if (
              locUrl.port === String(service.port) ||
              locUrl.hostname === 'localhost' ||
              locUrl.hostname === '127.0.0.1' ||
              locUrl.hostname === 'host.docker.internal'
            ) {
              newLocation = `${mountPrefix}/${service.id}${locUrl.pathname}${locUrl.search}${locUrl.hash}`;
            }
          }
        } catch {
          // Keep rawLocation on parsing error
        }
        responseHeaders['location'] = newLocation;
      }

      // Rewrite and inject Cookies
      const rawCookies = proxyRes.headers['set-cookie'];
      const cookieList = rawCookies ? (Array.isArray(rawCookies) ? [...rawCookies] : [rawCookies]) : [];
      const sanitizedCookies = cookieList.map((c) =>
        c
          .replace(/Domain=[^;]+;?\s*/gi, '')
          .replace(/Secure;?\s*/gi, '')
          .replace(/SameSite=Strict/gi, 'SameSite=Lax')
      );
      // Inject preview service cookie for subresource resolution
      sanitizedCookies.push(`editor_preview_service=${service.id}; Path=/; SameSite=Lax`);
      responseHeaders['set-cookie'] = sanitizedCookies;

      // Allow framing and CORS
      responseHeaders['access-control-allow-origin'] = '*';
      responseHeaders['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
      responseHeaders['access-control-allow-headers'] = '*';

      res.writeHead(statusCode, responseHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err: any) => {
      // Automatic fallback to host.docker.internal if connecting to 127.0.0.1 failed
      if (
        !retryWithHostDockerInternal &&
        isDocker &&
        targetHostname !== 'host.docker.internal' &&
        (err.code === 'ECONNREFUSED' || err.code === 'EHOSTUNREACH')
      ) {
        service.targetHost = 'host.docker.internal';
        forwardRequestToService(req, res, service, targetPath, mountPrefix, true);
        return;
      }

      console.error(`[DevProxy] Proxy error for ${service.name} (${targetHostname}:${service.port}):`, err.message);
      if (!res.headersSent) {
        res.status(502).json({
          error: 'Failed to connect to service',
          service: service.name,
          url: service.url,
          detail: err.message,
        });
      }
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({
          error: 'Service connection timeout',
          service: service.name,
          url: service.url,
        });
      }
    });

    // Handle body forwarding
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      const bodyData = Buffer.isBuffer(req.body)
        ? req.body
        : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
      proxyReq.setHeader('content-length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
      proxyReq.end();
    } else if (req.readableEnded) {
      proxyReq.end();
    } else {
      req.pipe(proxyReq);
    }
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Proxy error', detail: err.message });
    }
  }
}

/**
 * Fallback middleware to catch absolute asset and subresource requests
 * e.g. /static/*, /_next/*, /media/*, /favicon.ico, etc.
 * Resolves target service via Referer or Cookie.
 */
export function createAssetFallbackProxy(): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip backend internal endpoints
    const reqPath = req.path || '';
    if (RESERVED_BACKEND_PREFIXES.some((prefix) => reqPath.startsWith(prefix))) {
      return next();
    }

    let targetService: DetectedService | undefined;

    // 1. Check Referer header for /preview/:serviceId or /dev-proxy/:serviceId
    const referer = req.headers['referer'] || '';
    const refererMatch = referer.match(/(?:preview|dev-proxy)\/([a-zA-Z0-9_-]+)/);
    if (refererMatch) {
      targetService = serviceManager.getService(refererMatch[1]);
    }

    // 2. Check Cookie for editor_preview_service
    if (!targetService) {
      const cookies = req.headers['cookie'] || '';
      const cookieMatch = cookies.match(/editor_preview_service=([a-zA-Z0-9_-]+)/);
      if (cookieMatch) {
        targetService = serviceManager.getService(cookieMatch[1]);
      }
    }

    // 3. Fallback to active UI service if path looks like a static asset
    if (!targetService) {
      const isAssetPath =
        reqPath.startsWith('/static/') ||
        reqPath.startsWith('/_next/') ||
        reqPath.startsWith('/media/') ||
        reqPath.startsWith('/__vite/') ||
        reqPath.startsWith('/@vite/') ||
        reqPath.startsWith('/@fs/') ||
        reqPath === '/favicon.ico' ||
        /\.(js|css|map|png|jpg|jpeg|svg|gif|ico|woff|woff2|ttf|eot|json|webp)$/i.test(reqPath);

      if (isAssetPath) {
        const uiServices = serviceManager.getUIServices();
        if (uiServices.length > 0) {
          targetService = uiServices[0];
        }
      }
    }

    if (targetService && (targetService.status === 'running' || targetService.status === 'starting')) {
      const targetPath = req.originalUrl || req.url || reqPath;
      return forwardRequestToService(req, res, targetService, targetPath, '/preview');
    }

    next();
  };
}

/**
 * Handle WebSocket upgrades for proxied services and HMR.
 */
export function handleWebSocketUpgrade(httpServer: http.Server): void {
  httpServer.on('upgrade', (req, socket, head) => {
    const url = req.url || '';

    // Ignore backend socket.io requests
    if (url.startsWith('/socket.io/')) {
      return;
    }

    let targetService: DetectedService | undefined;
    let targetPath = url;

    // Case 1: Explicit /preview/:serviceId/* or /dev-proxy/:serviceId/*
    if (url.startsWith('/preview/') || url.startsWith('/dev-proxy/')) {
      const prefix = url.startsWith('/preview/') ? '/preview/' : '/dev-proxy/';
      const parts = url.replace(prefix, '').split('/');
      const serviceId = parts[0];
      targetService = serviceManager.getService(serviceId);
      targetPath = '/' + parts.slice(1).join('/');
    } else {
      // Case 2: HMR or subresource WebSockets (e.g. /_next/webpack-hmr, /__vite_hmr)
      const referer = req.headers['referer'] || '';
      const refererMatch = referer.match(/(?:preview|dev-proxy)\/([a-zA-Z0-9_-]+)/);
      if (refererMatch) {
        targetService = serviceManager.getService(refererMatch[1]);
      }

      if (!targetService) {
        const cookies = req.headers['cookie'] || '';
        const cookieMatch = cookies.match(/editor_preview_service=([a-zA-Z0-9_-]+)/);
        if (cookieMatch) {
          targetService = serviceManager.getService(cookieMatch[1]);
        }
      }

      if (!targetService) {
        const uiServices = serviceManager.getUIServices();
        if (uiServices.length > 0) {
          targetService = uiServices[0];
        }
      }
    }

    if (!targetService || (targetService.status !== 'running' && targetService.status !== 'starting')) {
      socket.destroy();
      return;
    }

    const targetHostname = targetService.targetHost || (targetService.host === 'localhost' ? '127.0.0.1' : targetService.host);
    const isHttps = targetService.protocol === 'https';
    const client = isHttps ? https : http;

    const hostHeader = (targetService.host === '127.0.0.1' || targetService.host === '0.0.0.0' || targetService.host === 'localhost')
      ? `localhost:${targetService.port}`
      : `${targetService.host}:${targetService.port}`;

    const options: http.RequestOptions = {
      hostname: targetHostname,
      port: targetService.port,
      path: targetPath,
      method: 'GET',
      headers: {
        ...req.headers,
        host: hostHeader,
      },
      rejectUnauthorized: false,
    };

    const proxyReq = client.request(options);

    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(proxyRes.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n') +
        '\r\n\r\n'
      );

      if (proxyHead.length > 0) {
        socket.write(proxyHead);
      }

      proxySocket.pipe(socket);
      socket.pipe(proxySocket);

      proxySocket.on('error', () => socket.destroy());
      socket.on('error', () => proxySocket.destroy());
      proxySocket.on('end', () => socket.end());
      socket.on('end', () => proxySocket.end());
    });

    proxyReq.on('error', (err) => {
      console.warn(`[DevProxy WS] Upgrade error for ${targetService?.name}:`, err.message);
      socket.destroy();
    });

    proxyReq.end();
  });
}
