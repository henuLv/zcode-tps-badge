// asar 归档读取与重打包工具（仅覆盖本插件所需的最小能力）
// 格式参考 Electron asar：8 字节 size pickle + header pickle + 连续文件负载
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const INTEGRITY_BLOCK_SIZE = 4 * 1024 * 1024;

export function openAsar(asarPath) {
  const fd = fs.openSync(asarPath, 'r');
  const probe = Buffer.alloc(16);
  fs.readSync(fd, probe, 0, 16, 0);
  // 布局: [0]=4 [4]=headerPickle总长 [8]=payloadSize [12]=jsonLen json从16开始
  const jsonLen = probe.readUInt32LE(12);
  const jsonBuf = Buffer.alloc(jsonLen);
  fs.readSync(fd, jsonBuf, 0, jsonLen, 16);
  const header = JSON.parse(jsonBuf.toString('utf8'));
  const baseOffset = 8 + probe.readUInt32LE(4);
  const fileSize = fs.fstatSync(fd).size;
  const alignPad = (4 - (jsonLen % 4)) % 4;
  // 校验负载起点与 pickle 对齐推导一致，防止格式误判
  if (probe.readUInt32LE(8) !== 4 + jsonLen + alignPad || baseOffset !== 16 + jsonLen + alignPad) {
    throw new Error(`asar 头解析异常: baseOffset=${baseOffset} jsonLen=${jsonLen}`);
  }
  return { fd, header, baseOffset, fileSize };
}

export function walkFiles(node, prefix = '', out = []) {
  if (node.files) {
    for (const [name, child] of Object.entries(node.files)) {
      walkFiles(child, `${prefix}/${name}`, out);
    }
  } else {
    out.push({ path: prefix, size: node.size ?? 0, offset: node.offset, unpacked: node.unpacked === true });
  }
  return out;
}

export function findEntry(header, innerPath) {
  const parts = innerPath.split('/').filter(Boolean);
  let node = header;
  for (const part of parts) {
    if (!node.files || !node.files[part]) return null;
    node = node.files[part];
  }
  return node.files ? null : node;
}

export function readEntryBytes(ctx, entry) {
  if (entry.unpacked) throw new Error('unpacked 文件不在 asar 负载内');
  const buf = Buffer.alloc(entry.size);
  fs.readSync(ctx.fd, buf, 0, entry.size, ctx.baseOffset + Number(entry.offset));
  return buf;
}

function setEntry(header, innerPath, value) {
  const parts = innerPath.split('/').filter(Boolean);
  let node = header;
  for (let i = 0; i < parts.length - 1; i++) {
    node = node.files[parts[i]];
  }
  node.files[parts[parts.length - 1]] = value;
}

function copyRange(fd, outFd, start, length) {
  const buf = Buffer.alloc(4 * 1024 * 1024);
  let done = 0;
  while (done < length) {
    const n = fs.readSync(fd, buf, 0, Math.min(buf.length, length - done), start + done);
    if (n <= 0) throw new Error('负载拷贝提前结束');
    fs.writeSync(outFd, buf, 0, n);
    done += n;
  }
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function computeIntegrity(buf) {
  const blocks = [];
  for (let i = 0; i < buf.length; i += INTEGRITY_BLOCK_SIZE) {
    blocks.push(sha256(buf.subarray(i, Math.min(i + INTEGRITY_BLOCK_SIZE, buf.length))));
  }
  return { algorithm: 'SHA256', hash: sha256(buf), blockSize: INTEGRITY_BLOCK_SIZE, blocks };
}

// 将指定内部文件替换为新内容后重打包到 outPath。
// 被替换文件写到负载尾部（新 offset），其余文件字节与 offset 原样保留，避免整体搬移。
export function repackWithReplacement(asarPath, innerPath, newContent, outPath) {
  const ctx = openAsar(asarPath);
  try {
    const entry = findEntry(ctx.header, innerPath);
    if (!entry) throw new Error(`asar 内未找到: ${innerPath}`);
    if (entry.unpacked) throw new Error('不支持替换 unpacked 文件');
    const payloadSize = ctx.fileSize - ctx.baseOffset;
    const tailOffset = payloadSize; // 新内容在负载中的起始位置

    setEntry(ctx.header, innerPath, {
      ...entry,
      offset: String(tailOffset),
      size: newContent.length,
      integrity: computeIntegrity(newContent),
    });
    const jsonBuf = Buffer.from(JSON.stringify(ctx.header), 'utf8');
    const alignPad = (4 - (jsonBuf.length % 4)) % 4;
    const headerPayloadSize = 4 + jsonBuf.length + alignPad;
    const headerPickleLen = 4 + headerPayloadSize;
    const baseOffset = 8 + headerPickleLen;

    const out = fs.openSync(outPath, 'w');
    try {
      const head = Buffer.alloc(8);
      head.writeUInt32LE(4, 0);
      head.writeUInt32LE(headerPickleLen, 4);
      fs.writeSync(out, head);
      const sizes = Buffer.alloc(8);
      sizes.writeUInt32LE(headerPayloadSize, 0);
      sizes.writeUInt32LE(jsonBuf.length, 4);
      fs.writeSync(out, sizes);
      fs.writeSync(out, jsonBuf);
      if (alignPad > 0) fs.writeSync(out, Buffer.alloc(alignPad));
      copyRange(ctx.fd, out, ctx.baseOffset, payloadSize);
      fs.writeSync(out, newContent);
    } finally {
      fs.closeSync(out);
    }
    return { tailOffset, jsonLen: jsonBuf.length, baseOffset, newFileSize: baseOffset + tailOffset + newContent.length };
  } finally {
    fs.closeSync(ctx.fd);
  }
}
