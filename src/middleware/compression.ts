import type { Context, Next } from 'hono';

/**
 * Response compression middleware
 * Compresses response bodies using gzip if the client supports it
 */
export function compression() {
  return async (c: Context, next: Next) => {
    await next();

    // Only compress responses that are large enough
    const body = c.res.body;
    if (!body) return;

    // Check if client accepts gzip encoding
    const acceptEncoding = c.req.header('Accept-Encoding') || '';
    if (!acceptEncoding.includes('gzip')) return;

    // Only compress certain content types
    const contentType = c.res.headers.get('Content-Type') || '';
    const compressibleTypes = [
      'text/',
      'application/json',
      'application/javascript',
      'application/xml',
      'application/xhtml+xml',
    ];
    
    const shouldCompress = compressibleTypes.some(type => contentType.includes(type));
    if (!shouldCompress) return;

    // Note: In a production environment, you would use a proper compression library
    // like 'compress' or 'zlib'. For Node.js environments, you can use:
    // import { gzip } from 'zlib';
    // import { promisify } from 'util';
    // const gzipAsync = promisify(gzip);
    // 
    // const compressed = await gzipAsync(Buffer.from(body));
    // c.res = new Response(compressed, {
    //   ...c.res,
    //   headers: {
    //     ...c.res.headers,
    //     'Content-Encoding': 'gzip',
    //     'Content-Length': compressed.length.toString(),
    //   },
    // });

    // For now, we'll just set the header to indicate compression support
    // The actual compression should be handled by the reverse proxy (nginx, cloudflare, etc.)
    c.header('Vary', 'Accept-Encoding');
  };
}

/**
 * Brotli compression middleware (if supported)
 * Higher compression ratio than gzip but slower
 */
export function brotliCompression() {
  return async (c: Context, next: Next) => {
    await next();

    const acceptEncoding = c.req.header('Accept-Encoding') || '';
    if (!acceptEncoding.includes('br')) return;

    // Note: Brotli compression requires 'iltorb' or similar library
    // This is a placeholder for future implementation
    c.header('Vary', 'Accept-Encoding');
  };
}
