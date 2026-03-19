// Helper convert Netlify event → Vercel req/res
async function netlifyToVercel(netlifyHandler, req, res) {
  // Build Netlify-style event từ Vercel req
  const url = new URL(req.url, `http://${req.headers.host}`);
  const queryParams = {};
  url.searchParams.forEach((v, k) => { queryParams[k] = v; });

  let body = '';
  let isBase64Encoded = false;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = Buffer.concat(chunks).toString('utf8');
  }

  const event = {
    httpMethod: req.method,
    path: url.pathname,
    queryStringParameters: queryParams,
    headers: req.headers,
    body: body || null,
    isBase64Encoded,
  };

  const result = await netlifyHandler(event);

  res.status(result.statusCode || 200);
  if (result.headers) {
    Object.entries(result.headers).forEach(([k, v]) => res.setHeader(k, v));
  }
  res.send(result.body || '');
}

module.exports = { netlifyToVercel };
