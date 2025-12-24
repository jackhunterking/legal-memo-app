console.info('html-test v1');

Deno.serve((_req: Request) => {
  const html = '<!doctype html><meta charset="utf-8"><title>OK</title><h1>HTML Test</h1>';
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Debug-Branch': 'html-test-ok',
    },
  });
});

