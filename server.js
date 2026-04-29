const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const HTML_PATH = path.join(__dirname, 'public', 'index.html');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // API
  if (url.pathname === '/api/analyze' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { image, mime, apiKey } = JSON.parse(body);
        if (!image) { res.writeHead(400); res.end(JSON.stringify({error:'画像データがありません'})); return; }
        if (!apiKey?.startsWith('sk-ant-')) { res.writeHead(401); res.end(JSON.stringify({error:'APIキーが不正です'})); return; }

        const fetch = (await import('node-fetch')).default;
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
          body: JSON.stringify({
            model: 'claude-opus-4-5',
            max_tokens: 2000,
            system: 'レシート・領収書の画像からすべての情報を抽出してJSON配列のみ返す。各要素: {"date":"MM-DD","amount":"数値のみ","store":"店舗名","category":"旅費交通費/会議費/交際費/消耗品費（現場）/通信費/雑費","desc":"説明"} dateはMM-DD形式。不明は空文字。JSON配列のみ出力。',
            messages: [{ role:'user', content:[
              { type:'image', source:{ type:'base64', media_type: mime||'image/jpeg', data:image }},
              { type:'text', text:'画像内のレシートをすべて抽出しJSON配列で返してください。' }
            ]}]
          })
        });
        if (!r.ok) {
          const e = await r.json().catch(()=>({}));
          res.writeHead(r.status, {'Content-Type':'application/json'});
          res.end(JSON.stringify({error: e.error?.message || `APIエラー: ${r.status}`}));
          return;
        }
        const data = await r.json();
        const text = data.content.filter(b=>b.type==='text').map(b=>b.text).join('');
        const parsed = JSON.parse(text.replace(/```json|```/g,'').trim());
        const items = Array.isArray(parsed) ? parsed : [parsed];
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({items}));
      } catch(e) {
        res.writeHead(500, {'Content-Type':'application/json'});
        res.end(JSON.stringify({error: e.message}));
      }
    });
    return;
  }

  // Static HTML
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
  res.end(html);
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
