/* zip.ts — minimal, dependency-free ZIP (STORED, uncompressed) writer for the
   Install step's "Copy files as a zip" option (AC-12). No zip library is a
   client dependency (checked package.json — none present, and adding one would
   touch the lockfile, outside this task's Owned paths), so this hand-rolls the
   handful of binary records a valid .zip needs: per-file local headers +
   central-directory records + one end-of-central-directory record. */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipPart {
  local: Uint8Array<ArrayBuffer>;
  data: Uint8Array<ArrayBuffer>;
  central: Uint8Array<ArrayBuffer>;
  offset: number;
}

/** Build a valid (STORED, no compression) .zip Blob from path+contents pairs. */
export function buildZip(files: { path: string; contents: string }[]): Blob {
  const encoder = new TextEncoder();
  const parts: ZipPart[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const dataBytes = encoder.encode(file.contents);
    const crc = crc32(dataBytes);

    const localBuf = new ArrayBuffer(30 + nameBytes.length);
    const local = new DataView(localBuf);
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0, true); // flags
    local.setUint16(8, 0, true); // method: stored
    local.setUint16(10, 0, true); // mod time
    local.setUint16(12, 0, true); // mod date
    local.setUint32(14, crc, true);
    local.setUint32(18, dataBytes.length, true); // compressed size
    local.setUint32(22, dataBytes.length, true); // uncompressed size
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true); // extra field length
    new Uint8Array(localBuf).set(nameBytes, 30);

    const centralBuf = new ArrayBuffer(46 + nameBytes.length);
    const central = new DataView(centralBuf);
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true); // version made by
    central.setUint16(6, 20, true); // version needed
    central.setUint16(8, 0, true); // flags
    central.setUint16(10, 0, true); // method
    central.setUint16(12, 0, true); // mod time
    central.setUint16(14, 0, true); // mod date
    central.setUint32(16, crc, true);
    central.setUint32(20, dataBytes.length, true);
    central.setUint32(24, dataBytes.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint16(30, 0, true); // extra length
    central.setUint16(32, 0, true); // comment length
    central.setUint16(34, 0, true); // disk number start
    central.setUint16(36, 0, true); // internal attrs
    central.setUint32(38, 0, true); // external attrs
    central.setUint32(42, offset, true); // relative offset of local header
    new Uint8Array(centralBuf).set(nameBytes, 46);

    const localBytes = new Uint8Array(localBuf);
    parts.push({ local: localBytes, data: dataBytes, central: new Uint8Array(centralBuf), offset });
    offset += localBytes.length + dataBytes.length;
  }

  const centralStart = offset;
  const centralSize = parts.reduce((sum, p) => sum + p.central.length, 0);

  const endBuf = new ArrayBuffer(22);
  const end = new DataView(endBuf);
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true); // disk number
  end.setUint16(6, 0, true); // disk with central dir
  end.setUint16(8, parts.length, true); // entries on this disk
  end.setUint16(10, parts.length, true); // total entries
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralStart, true);
  end.setUint16(20, 0, true); // comment length

  const chunks: BlobPart[] = [];
  for (const p of parts) chunks.push(p.local, p.data);
  for (const p of parts) chunks.push(p.central);
  chunks.push(new Uint8Array(endBuf));

  return new Blob(chunks, { type: "application/zip" });
}

/** Trigger a same-page browser download of a Blob — no navigation, no new tab. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
