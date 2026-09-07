// ============================================================
// generate-ts-xor.js - TS 封装 + XOR 加密（无压缩）
// ============================================================

const fs = require('fs');

const CONFIG = {
    PART_SIZE_MB: 10,
    XOR_KEY: 0x5A,                    // 简单 XOR 密钥
};

// ---------- 创建 TS 包 (188 字节) ----------
function createTSPacket(payload, packetIndex, payloadStart) {
    const header = Buffer.alloc(4);
    header[0] = 0x47;
    const pid = 0x100;
    header[1] = (payloadStart ? 0x40 : 0x00) | (pid >> 8);
    header[2] = pid & 0xff;
    header[3] = packetIndex % 16;
    const packet = Buffer.concat([header, payload]);
    if (packet.length < 188) {
        const pad = Buffer.alloc(188 - packet.length, 0xff);
        return Buffer.concat([packet, pad]);
    }
    return packet.slice(0, 188);
}

// ---------- 封装数据为 TS ----------
function dataToTS(dataBuffer, isFirstPart) {
    const chunks = [];
    let packetIdx = 0;
    const PAYLOAD_SIZE = 184;

    if (isFirstPart) {
        // PAT
        const patPayload = Buffer.from([0x00,0x00,0xb0,0x0d,0x00,0x01,0xc1,0x00,0x00,0x01,0x10,0x00,0x00,0x00,0x00]);
        chunks.push(createTSPacket(patPayload, packetIdx++, true));
        // PMT
        const pmtPayload = Buffer.from([0x02,0x80,0x04,0x0d,0x00,0x01,0x07,0x00,0xe0,0x00,0xf0,0x00,0x0f,0x00,0xf0,0x00,0x00,0x00,0x00,0x00]);
        chunks.push(createTSPacket(pmtPayload, packetIdx++, true));
    }

    let offset = 0;
    while (offset < dataBuffer.length) {
        const chunk = dataBuffer.slice(offset, offset + PAYLOAD_SIZE);
        const payload = Buffer.alloc(PAYLOAD_SIZE);
        chunk.copy(payload);
        const packet = createTSPacket(payload, packetIdx++, false);
        chunks.push(packet);
        offset += PAYLOAD_SIZE;
    }
    return Buffer.concat(chunks);
}

// ---------- 主函数 ----------
function generateTSXor(filePath) {
    console.log('='.repeat(60));
    console.log(`🚀 TS 封装 + XOR 加密 (密钥: 0x${CONFIG.XOR_KEY.toString(16)})`);
    console.log('='.repeat(60));

    const original = fs.readFileSync(filePath);
    console.log(`📁 原始大小: ${(original.length / 1024 / 1024).toFixed(2)} MB`);

    // XOR 加密整个文件
    const encrypted = Buffer.from(original);
    for (let i = 0; i < encrypted.length; i++) {
        encrypted[i] = encrypted[i] ^ CONFIG.XOR_KEY;
    }
    console.log(`🔒 XOR 加密完成`);

    const partSize = CONFIG.PART_SIZE_MB * 1024 * 1024;
    const totalParts = Math.ceil(encrypted.length / partSize);
    const tsFiles = [];

    for (let i = 0; i < totalParts; i++) {
        const start = i * partSize;
        const end = Math.min(start + partSize, encrypted.length);
        const dataPart = encrypted.slice(start, end);
        const tsStream = dataToTS(dataPart, i === 0);
        const filename = `part_${String(i).padStart(6, '0')}.ts`;
        fs.writeFileSync(filename, tsStream);
        tsFiles.push(filename);
        console.log(`   ✅ ${filename} (${tsStream.length} bytes)`);
    }

    // 生成 .m3u8
    const m3u8 = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        `#EXT-X-TARGETDURATION:${CONFIG.PART_SIZE_MB}`,
        ...tsFiles.map(f => `#EXTINF:${CONFIG.PART_SIZE_MB}.0,\n${f}`),
        '#EXT-X-ENDLIST'
    ].join('\n');
    fs.writeFileSync('playlist.m3u8', m3u8);
    console.log('✅ 生成 playlist.m3u8');

    // 生成 manifest.json
    const manifest = {
        type: 'ts-xor',
        xor_key: CONFIG.XOR_KEY,
        part_count: totalParts,
        playlist: 'playlist.m3u8'
    };

    const tsFileList = tsFiles.map(f => `'${f}'`).join(',');
    const indexHTML = `<!DOCTYPE html><html><head><title>TS Stream</title></head><body><h1>TS 串流</h1>
    <p>共 ${totalParts}個分片</p>
    <script>
    window.__STEGO_MANIFEST = {
        type: 'ts-xor',
        xor_key: ${CONFIG.XOR_KEY},
        part_count: ${totalParts},
        files: [${tsFileList}]
    };
    </script>
    </body></html>`
    fs.writeFileSync('index.html', indexHTML);
    console.log ('生成 index.html (內嵌 manifest)');

    // fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2));
    // console.log('✅ 生成 manifest.json');

    // fs.writeFileSync('index.html', `<!DOCTYPE html><html><head><title>TS Stream</title></head><body><h1>TS 串流</h1></body></html>`);
    // console.log('✅ 生成 index.html');

    console.log(`🎉 完成！共 ${totalParts} 个分片。`);
    console.log('='.repeat(60));
}

if (require.main === module) {
    const file = process.argv[2];
    if (!file) { console.error('用法: node generate-ts-xor.js <文件>'); process.exit(1); }
    if (!fs.existsSync(file)) { console.error(`❌ 找不到文件: ${file}`); process.exit(1); }
    generateTSXor(file);
}