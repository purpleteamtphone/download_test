SVG:
javascript:(function(){
  const svg = document.getElementById('stego-svg');
  if (!svg) return alert('❌ 找不到 SVG 容器');

  const paths = svg.querySelectorAll('path');
  if (paths.length === 0) return alert('❌ SVG 內無 Path 資料');

  let b64Data = '';
  // 按照 data-idx 排序確保順序正確
  const sortedPaths = Array.from(paths).sort((a, b) => 
    parseInt(a.getAttribute('data-idx')) - parseInt(b.getAttribute('data-idx'))
  );

  for (const path of sortedPaths) {
    const d = path.getAttribute('d');
    // 解析座標 "M x1 y1 L x2 y2 ..."
    const coords = d.match(/[\d.]+/g);
    if (!coords) continue;
    
    for (let i = 0; i < coords.length; i += 2) {
      const x = parseInt(coords[i]);
      const y = parseInt(coords[i+1]);
      if (!isNaN(x)) b64Data += String.fromCharCode(x);
      if (!isNaN(y) && y > 0) b64Data += String.fromCharCode(y);
    }
  }

  try {
    // 還原為 Blob 並觸發下載
    const binary = atob(b64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'extracted_file.exe';
    a.click();
    URL.revokeObjectURL(url);
    alert(`✅ 成功提取 ${bytes.length} bytes！`);
  } catch (e) {
    alert('❌ 解碼失敗: ' + e.message);
  }
})();



CSS:
javascript:(function(){
  const container = document.getElementById('css-stego-container');
  if (!container) return alert('❌ 找不到 CSS 容器');

  const elements = container.children;
  if (elements.length === 0) return alert('❌ 無 CSS 隱寫元素');

  let b64Data = '';
  for (let i = 0; i < elements.length; i++) {
    // 讀取 CSS 變數 --d
    const val = getComputedStyle(elements[i]).getPropertyValue('--d').trim();
    // 移除前後可能存在的引號
    const cleanVal = val.replace(/^["']|["']$/g, ''); 
    b64Data += cleanVal;
  }

  try {
    const binary = atob(b64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'extracted_css.exe';
    a.click();
    URL.revokeObjectURL(url);
    alert(`✅ 成功提取 ${bytes.length} bytes！`);
  } catch (e) {
    alert('❌ 解碼失敗: ' + e.message);
  }
})();

