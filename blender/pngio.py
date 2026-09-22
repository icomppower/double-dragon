"""Minimal PNG I/O on numpy (8-bit RGBA, non-interlaced). Used by the sprite pipeline so atlas bytes never pass
through Blender's colour management: what the renderer wrote to disk is what lands in the atlas."""
import struct, zlib
import numpy as np


def read(path):
    """-> uint8 array (H, W, 4)."""
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', path
    pos, idat, w, h, bit, ctype = 8, [], 0, 0, 0, 0
    while pos < len(data):
        ln, ct = struct.unpack('>I4s', data[pos:pos + 8]); body = data[pos + 8:pos + 8 + ln]; pos += 12 + ln
        if ct == b'IHDR': w, h, bit, ctype, _, _, il = struct.unpack('>IIBBBBB', body); assert bit == 8 and il == 0, (bit, il)
        elif ct == b'IDAT': idat.append(body)
        elif ct == b'IEND': break
    ch = {6: 4, 2: 3, 4: 2, 0: 1}[ctype]
    raw = np.frombuffer(zlib.decompress(b''.join(idat)), dtype=np.uint8)
    stride = w * ch; rows = raw.reshape(h, stride + 1)
    out = np.zeros((h, stride), dtype=np.uint8); prev = np.zeros(stride, dtype=np.int32)
    for y in range(h):
        f = rows[y, 0]; cur = rows[y, 1:].astype(np.int32)
        if f == 0: rec = cur
        elif f == 1:
            rec = cur.copy()
            for x in range(ch, stride): rec[x] = (rec[x] + rec[x - ch]) & 255
        elif f == 2: rec = (cur + prev) & 255
        elif f == 3:
            rec = cur.copy()
            for x in range(stride): rec[x] = (rec[x] + ((rec[x - ch] if x >= ch else 0) + prev[x]) // 2) & 255
        elif f == 4:
            rec = cur.copy()
            for x in range(stride):
                a = rec[x - ch] if x >= ch else 0; b = prev[x]; c = prev[x - ch] if x >= ch else 0
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                rec[x] = (rec[x] + pr) & 255
        else: raise ValueError('filter %d' % f)
        out[y] = rec; prev = rec
    img = out.reshape(h, w, ch)
    if ch == 4: return img
    rgba = np.zeros((h, w, 4), dtype=np.uint8); rgba[..., 3] = 255
    if ch == 3: rgba[..., :3] = img
    elif ch == 2: rgba[..., :3] = img[..., :1]; rgba[..., 3] = img[..., 1]
    else: rgba[..., :3] = img
    return rgba


def write(path, rgba, level=9):
    """rgba: uint8 (H, W, 4). Filter 0 rows (flat sprite art compresses fine without prediction)."""
    h, w = rgba.shape[:2]
    rows = np.concatenate([np.zeros((h, 1), dtype=np.uint8), rgba.reshape(h, w * 4)], axis=1).tobytes()
    def chunk(ct, body): return struct.pack('>I', len(body)) + ct + body + struct.pack('>I', zlib.crc32(ct + body) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, level)) + chunk(b'IEND', b'')
    open(path, 'wb').write(png)
    return len(png)
