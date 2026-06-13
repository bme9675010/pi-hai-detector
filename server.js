// 簡易本機靜態伺服器（開發/預覽用）
const http = require('http'), fs = require('fs'), path = require('path');
const types = { '.html':'text/html;charset=utf-8', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png' };
const PORT = process.env.PORT || 8731;
http.createServer((req, res) => {
  let f = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  f = path.join(__dirname, decodeURIComponent(f));
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end('Not found'); }
    else { res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'text/plain' }); res.end(d); }
  });
}).listen(PORT, () => console.log('屁孩偵測器 running at http://localhost:' + PORT));
