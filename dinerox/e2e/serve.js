/* Sert l'export web (SPA) : node e2e/serve.js <dossier-export> [port]. */
const http = require('http'), fs = require('fs'), path = require('path');
const root = process.argv[2] || 'dist';
const port = Number(process.argv[3] || 8098);
const types = { '.js': 'application/javascript', '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html');
  res.setHeader('content-type', types[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log(`export servi sur http://localhost:${port}`));
