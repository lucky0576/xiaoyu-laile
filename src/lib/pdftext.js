/**
 * PDF 文本提取（支持 ToUnicode CMap）
 *
 * 为什么必须单独做这一层：
 *   中文 PDF 几乎都用 Type0 / Identity-H 子集字体，内容流里的字符串是 **CID 而不是码点**。
 *   不做 ToUnicode 映射就只能按字节硬读，结果是一堆乱码（`¶ Lc 5/ +e 1Ç Ë`）。
 *   下游的 AI 拿到这种文本，汇总自然残缺 —— 不是模型不行，是喂进去的料是垃圾。
 *
 * 实现范围：
 *   · 扫描 `N 0 obj ... endobj`，建立对象表
 *   · 解析字体的 /ToUnicode 流（beginbfchar / beginbfrange）
 *   · 按页解析 /Resources /Font，得到该页 资源名 → CID 映射
 *   · 解析内容流，跟踪 Tf 切换字体，把 CID 还原成 Unicode
 *
 * 不支持的（会明确降级，不静默出错）：
 *   · 对象流 /ObjStm、交叉引用流 /XRef（本模块回退到旧解析器）
 *   · 扫描件（无文字层）—— 本来就没有文本可提
 */
import { inflateSync, inflateRawSync } from 'node:zlib';

/* ------------------------------------------------------------------ */
/* 基础工具                                                            */
/* ------------------------------------------------------------------ */

function inflate(bytes) {
  try {
    return inflateSync(bytes);
  } catch {
    /* 试 raw */
  }
  try {
    return inflateRawSync(bytes);
  } catch {
    return null;
  }
}

/** 把 PDF 十六进制串按 UTF-16BE 还原成字符串 */
function hexToUnicode(hex) {
  const h = String(hex || '').replace(/[^0-9A-Fa-f]/g, '');
  if (!h) return '';
  let s = '';
  // 常见是 2 字节一个码元；奇数长度时按单字节兜底
  const step = h.length % 4 === 0 ? 4 : 2;
  for (let i = 0; i + step <= h.length; i += step) {
    const cp = parseInt(h.slice(i, i + step), 16);
    if (cp > 0 && cp !== 0xfffd) s += String.fromCharCode(cp);
  }
  return s;
}

/** 转义 PDF 字面量字符串：\n \r \t \b \f \( \) \\ \ddd */
function unescapePdfLiteral(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== '\\') {
      out.push(ch);
      continue;
    }
    const n = s[++i];
    if (n === undefined) break;
    if (n === 'n') out.push('\n');
    else if (n === 'r') out.push('\r');
    else if (n === 't') out.push('\t');
    else if (n === 'b') out.push('\b');
    else if (n === 'f') out.push('\f');
    else if (n === '(' || n === ')' || n === '\\') out.push(n);
    else if (n >= '0' && n <= '7') {
      let oct = n;
      while (oct.length < 3 && s[i + 1] >= '0' && s[i + 1] <= '7') oct += s[++i];
      out.push(String.fromCharCode(parseInt(oct, 8)));
    } else out.push(n);
  }
  return out.join('');
}

/* ------------------------------------------------------------------ */
/* 对象表                                                              */
/* ------------------------------------------------------------------ */

function scanObjects(raw, buf) {
  const objects = new Map();
  const re = /(?:^|[^0-9])(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const num = Number(m[1]);
    const bodyStart = m.index + m[0].length;
    const endIdx = raw.indexOf('endobj', bodyStart);
    const bodyEnd = endIdx < 0 ? raw.length : endIdx;
    const body = raw.slice(bodyStart, bodyEnd);

    // 找流：`stream` 后面必须是换行，然后到 `endstream`
    let stream = null;
    const si = body.indexOf('stream');
    if (si >= 0) {
      let s = si + 6;
      if (body[s] === '\r') s++;
      if (body[s] === '\n') s++;
      const ei = body.indexOf('endstream', s);
      const from = bodyStart + s;
      const to = bodyStart + (ei < 0 ? body.length : ei);
      stream = buf.subarray(from, to);
    }
    objects.set(num, {
      num,
      dict: si >= 0 ? body.slice(0, si) : body,
      stream,
    });
    re.lastIndex = bodyEnd;
  }
  return objects;
}

/** 对象流 / 交叉引用流存在时本模块不处理，交给旧解析器 */
export function hasObjectStreams(raw) {
  return /\/Type\s*\/ObjStm\b/.test(raw) || /\/Type\s*\/XRef\b/.test(raw);
}

function decodeStream(obj) {
  if (!obj || !obj.stream) return null;
  const dict = obj.dict || '';
  if (!/\/Filter/.test(dict)) return obj.stream;
  if (/\/FlateDecode/.test(dict)) return inflate(obj.stream);
  return null;
}

/* ------------------------------------------------------------------ */
/* ToUnicode CMap                                                      */
/* ------------------------------------------------------------------ */

function parseCMap(text) {
  const map = new Map();
  if (!text) return map;

  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      const code = parseInt(p[1], 16);
      if (Number.isFinite(code)) map.set(code, hexToUnicode(p[2]));
    }
  }

  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = block[1];
    for (const it of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]*)>|\[([\s\S]*?)\])/g)) {
      const lo = parseInt(it[1], 16);
      const hi = parseInt(it[2], 16);
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) continue;

      if (it[3] !== undefined) {
        const base = parseInt(it[3], 16);
        const span = Math.min(hi - lo, 65535 - base);
        for (let i = 0; i <= span; i++) map.set(lo + i, String.fromCharCode(base + i));
      } else if (it[4] !== undefined) {
        let i = 0;
        for (const a of it[4].matchAll(/<([0-9A-Fa-f]*)>/g)) {
          map.set(lo + i, hexToUnicode(a[1]));
          i++;
        }
      }
    }
  }
  return map;
}

/** 字体对象号 → CID 映射 */
function buildFontMaps(objects) {
  const byFontObj = new Map();
  for (const obj of objects.values()) {
    const m = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(obj.dict || '');
    if (!m) continue;
    const tu = objects.get(Number(m[1]));
    const text = decodeStream(tu);
    if (text) byFontObj.set(obj.num, parseCMap(text.toString('latin1')));
  }
  return byFontObj;
}

/* ------------------------------------------------------------------ */
/* 资源与页面                                                          */
/* ------------------------------------------------------------------ */

/**
 * 从 idx 处的 `<<` 开始做**配平**匹配，返回内层文本。
 *
 * 不能用 /<<([\s\S]*?)>>/ 这种非贪婪正则：PDF 字典是嵌套的，例如
 *   /Resources <</ExtGState <</GS13 13 0 R>> /Font <</FT8 8 0 R>>>>
 * 非贪婪会在第一个 `>>` 就停下，把后面的 /Font 整段切掉，
 * 结果就是取不到字体、ToUnicode 全部丢失。
 */
function readDict(text, idx) {
  if (text.slice(idx, idx + 2) !== '<<') return null;
  let depth = 0;
  for (let i = idx; i < text.length - 1; i++) {
    const two = text.slice(i, i + 2);
    if (two === '<<') {
      depth++;
      i++;
      continue;
    }
    if (two === '>>') {
      depth--;
      if (depth === 0) return { start: idx + 2, end: i, text: text.slice(idx + 2, i) };
      i++;
    }
  }
  return null;
}

/** 取 /Key 的值：内联字典返回文本，间接引用返回 {ref:num}，找不到返回 null */
function readEntry(text, key) {
  const re = new RegExp(`/${key}\\s*`, 'g');
  const m = re.exec(text || '');
  if (!m) return null;
  const idx = m.index + m[0].length;
  if (text.slice(idx, idx + 2) === '<<') {
    const d = readDict(text, idx);
    return d ? { text: d.text } : null;
  }
  const ref = /^(\d+)\s+0\s+R/.exec(text.slice(idx));
  if (ref) return { ref: Number(ref[1]) };
  return null;
}

/** 从资源字典里取出 资源名 → 字体对象号 */
function parseFontResources(dictText, objects, depth = 0) {
  const out = new Map();
  if (!dictText || depth > 3) return out;

  const fm = readEntry(dictText, 'Font');
  if (!fm) return out;

  let inner = fm.text || '';
  if (fm.ref !== undefined) {
    const fo = objects.get(fm.ref);
    inner = fo ? fo.dict || '' : '';
  }
  for (const m of inner.matchAll(/\/([A-Za-z0-9#_.+-]+)\s+(\d+)\s+0\s+R/g)) {
    out.set(m[1], Number(m[2]));
  }
  return out;
}

/** 解析页面对象，按 Kids 顺序返回。
 *  /Resources 常常挂在父节点 /Pages 上而不是每一页自己身上（PDF 规范允许继承），
 *  所以这里把上级的 Resources 往下传，否则取不到字体、ToUnicode 就全丢了。 */
function collectPages(objects) {
  const pages = [];
  const seen = new Set();

  /** 取出 /Resources 的文本（内联或引用），没有就返回 '' */
  const resourcesOf = (dict) => {
    const rm = readEntry(dict, 'Resources');
    if (!rm) return '';
    if (rm.ref !== undefined) {
      const ro = objects.get(rm.ref);
      return ro ? ro.dict || '' : '';
    }
    return rm.text || '';
  };

  const visit = (num, depth, inheritedRes) => {
    if (depth > 50 || seen.has(num)) return;
    seen.add(num);
    const obj = objects.get(num);
    if (!obj) return;
    const dict = obj.dict || '';
    const res = resourcesOf(dict) || inheritedRes || '';

    if (/\/Type\s*\/Page(?![a-zA-Z])/.test(dict)) {
      pages.push({ obj, resources: res });
      return;
    }
    const kids = /\/Kids\s*\[([\s\S]*?)\]/.exec(dict);
    if (kids) {
      for (const k of kids[1].matchAll(/(\d+)\s+0\s+R/g)) visit(Number(k[1]), depth + 1, res);
      return;
    }
  };

  // 找根节点：有 /Kids 且不是 /Page 的 /Type /Pages
  let rootNum = null;
  for (const obj of objects.values()) {
    if (/\/Type\s*\/Pages/.test(obj.dict || '') && /\/Kids/.test(obj.dict || '')) {
      rootNum = obj.num;
      break;
    }
  }
  if (rootNum !== null) visit(rootNum, 0, '');

  // 没走通就按对象号顺序兜底
  if (!pages.length) {
    for (const obj of [...objects.values()].sort((a, b) => a.num - b.num)) {
      if (/\/Type\s*\/Page(?![a-zA-Z])/.test(obj.dict || '')) {
        pages.push({ obj, resources: resourcesOf(obj.dict || '') });
      }
    }
  }
  return pages;
}

/* ------------------------------------------------------------------ */
/* 内容流文本提取                                                      */
/* ------------------------------------------------------------------ */

// 词法：绘图名 / 字面量串 / 十六进制串 / 数字 / 数组括号 / 操作符
const TOKEN_RE =
  /\/[A-Za-z0-9#_.+-]+|\((?:[^()\\]|\\.|\((?:[^()\\]|\\.)*\))*\)|<[0-9A-Fa-f\s]*>|-?\d*\.?\d+|\[|\]|[A-Za-z*'"]+/g;

const OPERATORS = new Set([
  'Tf', 'Td', 'TD', 'Tm', 'T*', 'TJ', 'Tj', "'", '"', 'ET', 'BT',
  'Tc', 'Tw', 'Tz', 'TL', 'Ts', 'Tr', 'Tq', 'Q', 'q', 'cm', 'gs', 're', 'Do',
]);

/**
 * 提取一段内容流的文本。
 *
 * 换行不是「遇到定位操作符就换」，而是**比较文本 Y 坐标**：
 * 中文 PDF 常在每个字符之间插入定位操作，按操作符换行会把整页拆成竖排单字。
 * 这里跟踪 Td / TD / Tm 维护当前 Y，只有 Y 真正变化时才断行。
 *
 * @param {string} content 解压后的内容流
 * @param {Map<string, Map<number,string>>} fontMaps 资源名 → CID 映射
 */
function extractFromContent(content, fontMaps) {
  if (!content) return { text: '', hits: 0, misses: 0 };

  const tokens = content.match(TOKEN_RE) || [];
  const operands = [];

  let curMap = null;
  let ty = 0; // 当前文本 Y
  let lastY = null; // 上一次落字的 Y
  let line = '';
  let out = '';
  let hits = 0;
  let misses = 0;

  const flushLine = (force = false) => {
    if (!line) return;
    out += line;
    line = '';
    if (force || !out.endsWith('\n')) out += '\n';
  };

  /** 落一段文字；Y 变了就断行 */
  const emit = (s) => {
    if (!s) return;
    if (lastY !== null && Math.abs(ty - lastY) > 1.5) flushLine();
    line += s;
    lastY = ty;
  };

  /** 十六进制串 → 文本（按当前字体的 ToUnicode 映射） */
  const showHex = (hexRaw) => {
    const hex = hexRaw.replace(/[^0-9A-Fa-f]/g, '');
    if (hex.length < 2) return;
    if (curMap) {
      let s = '';
      for (let i = 0; i + 4 <= hex.length; i += 4) {
        const code = parseInt(hex.slice(i, i + 4), 16);
        const u = curMap.get(code);
        if (u !== undefined) {
          s += u;
          hits++;
        } else misses++;
      }
      emit(s);
    } else {
      emit(hexToUnicode(hex));
    }
  };

  /** 字面量串 → 文本 */
  const showLiteral = (litRaw) => {
    const lit = unescapePdfLiteral(litRaw);
    if (!curMap) {
      emit(lit);
      return;
    }
    // Identity-H / CID 编码下，字面量串同样是 2 字节一个 CID
    let s = '';
    for (let i = 0; i + 1 < lit.length; i += 2) {
      const code = (lit.charCodeAt(i) << 8) | lit.charCodeAt(i + 1);
      const u = curMap.get(code);
      if (u !== undefined) {
        s += u;
        hits++;
      } else misses++;
    }
    emit(s);
  };

  for (const tok of tokens) {
    if (tok === '/') continue;

    if (!OPERATORS.has(tok)) {
      operands.push(tok);
      if (operands.length > 64) operands.splice(0, operands.length - 64);
      continue;
    }

    switch (tok) {
      case 'Tf': {
        // 操作数：/FontName size
        const name = operands.find((o) => o.startsWith('/'));
        curMap = name ? fontMaps.get(name.slice(1)) || null : null;
        break;
      }
      case 'Td':
      case 'TD': {
        const y = Number(operands[operands.length - 1]);
        if (Number.isFinite(y)) ty += y;
        break;
      }
      case 'Tm': {
        const f = Number(operands[operands.length - 1]);
        if (Number.isFinite(f)) ty = f;
        break;
      }
      case 'T*': {
        // 按行距换行：用一个足够大的位移触发断行
        flushLine();
        ty -= 12;
        break;
      }
      case 'Tj':
      case "'":
      case '"': {
        const last = operands[operands.length - 1] || '';
        if (last.startsWith('(')) showLiteral(last.slice(1, -1));
        else if (last.startsWith('<')) showHex(last);
        if (tok === "'" || tok === '"') ty -= 12;
        break;
      }
      case 'TJ': {
        // 数组里的字符串逐个落字，数字是字距微调，不换行
        for (const o of operands) {
          if (o.startsWith('(')) showLiteral(o.slice(1, -1));
          else if (o.startsWith('<')) showHex(o);
        }
        break;
      }
      case 'BT': {
        ty = 0;
        lastY = null;
        break;
      }
      case 'ET': {
        flushLine();
        break;
      }
      default:
        break;
    }
    operands.length = 0;
  }

  flushLine();
  return { text: out, hits, misses };
}

/* ------------------------------------------------------------------ */
/* 对外入口                                                            */
/* ------------------------------------------------------------------ */

/**
 * 提取 PDF 文本。
 * @returns {{text:string, pages:number, mode:'tounicode'|'none', cidHits:number, cidMisses:number, note:string}}
 */
export function extractPdfText(buf) {
  const raw = buf.toString('latin1');

  if (hasObjectStreams(raw)) {
    return {
      text: '',
      pages: 0,
      mode: 'none',
      cidHits: 0,
      cidMisses: 0,
      note: 'pdf: 使用了对象流 / 交叉引用流，本解析器暂不支持',
    };
  }

  const objects = scanObjects(raw, buf);
  const fontObjMaps = buildFontMaps(objects);
  const pages = collectPages(objects);

  if (!objects.size || !pages.length) {
    return { text: '', pages: 0, mode: 'none', cidHits: 0, cidMisses: 0, note: 'pdf: 未解析出页面对象' };
  }

  const chunks = [];
  let cidHits = 0;
  let cidMisses = 0;

  for (const page of pages) {
    const dict = page.obj.dict || '';
    // Resources 已在 collectPages 里按继承链取好
    const fontByName = parseFontResources(page.resources || '', objects);
    const mapsByName = new Map();
    for (const [name, objNum] of fontByName) {
      const cm = fontObjMaps.get(objNum);
      if (cm) mapsByName.set(name, cm);
    }

    // 内容流可能是一个或多个
    let contentRefs = [];
    const cm = /\/Contents\s*(?:(\d+)\s+0\s+R|\[([\s\S]*?)\])/.exec(dict);
    if (cm) {
      if (cm[1]) contentRefs.push(Number(cm[1]));
      else if (cm[2]) for (const k of cm[2].matchAll(/(\d+)\s+0\s+R/g)) contentRefs.push(Number(k[1]));
    }
    let content = '';
    for (const ref of contentRefs) {
      const decoded = decodeStream(objects.get(ref));
      if (decoded) content += `${decoded.toString('latin1')}\n`;
    }
    if (!content) continue;

    const r = extractFromContent(content, mapsByName);
    cidHits += r.hits;
    cidMisses += r.misses;
    if (r.text.trim()) chunks.push(r.text);
  }

  let text = chunks.join('\n');
  // 压缩空行、去掉常见的孤立控制字符
  text = text
    .replace(/\r/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\u0000/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const mode = cidHits > 0 ? 'tounicode' : 'none';
  const note =
    mode === 'tounicode'
      ? `pdf: 通过 ToUnicode 映射还原了 ${cidHits} 个字符`
      : 'pdf: 未找到 ToUnicode 映射，文本可能不准确';

  return { text, pages: pages.length, mode, cidHits, cidMisses, note };
}

export default { extractPdfText, hasObjectStreams };
