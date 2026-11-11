/* 智汇排版 · content.js
 * 注入公众号后台编辑器，提供样式套用 / 全文排版 / 复制富文本 / 采集到 GitHub
 * 注意：微信只认内联 style，会过滤 class 与 <style>，所有样式必须写在 style 属性里。
 */
(() => {
  'use strict';
  if (window.__ZHP_LOADED__) return;
  window.__ZHP_LOADED__ = true;

  const EDITOR_SELECTORS = [
    '#ueditor_0',
    '.edui-body-container',
    '#js_editorArea',
    '.ProseMirror',
    'div[contenteditable="true"]'
  ];

  const BASE_TEXT = 'font-size:16px;line-height:1.75;color:#3f3f3f;letter-spacing:0.5px;';
  const API = 'http://127.0.0.1:7357';

  let editor = null;
  let panelEl = null;
  let statusEl = null;
  let collapsed = false;
  let retry = 0;
  const MAX_RETRY = 25;

  // ---------- 状态行 ----------
  function showStatus(msg, hold) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = /失败|出错|没找到|请先|没启动|没取到/.test(msg) ? '#c0392b' : '#888';
    clearTimeout(statusEl.__t);
    statusEl.__t = setTimeout(() => {
      if (statusEl) { statusEl.textContent = '就绪'; statusEl.style.color = '#888'; }
    }, hold || 4000);
  }

  // ---------- 编辑器定位 ----------
  function findEditor() {
    for (const sel of EDITOR_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && (el.offsetParent !== null || el.getClientRects().length > 0)) {
        editor = el;
        return true;
      }
    }
    return false;
  }

  // ---------- 面板 ----------
  function el(tag, css, text) {
    const n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (text != null) n.textContent = text;
    return n;
  }

  function buildPanel() {
    if (document.getElementById('zhp-panel') || !editor) return;

    const panel = el('div', [
      'position:fixed', 'right:0', 'top:110px', 'width:300px', 'z-index:2147483000',
      'background:#ffffff', 'border:1px solid #e5e5e5', 'border-radius:8px 0 0 8px',
      'box-shadow:-2px 4px 16px rgba(0,0,0,.12)', 'overflow-y:auto', 'max-height:78vh',
      'padding:0', 'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif',
      'font-size:12px', 'line-height:1.4', 'color:#333', 'text-align:left'
    ].join(';'));
    panel.id = 'zhp-panel';

    // 头
    const head = el('div', [
      'display:flex', 'align-items:center', 'justify-content:space-between',
      'background:#07C160', 'color:#fff', 'padding:10px 12px', 'border-radius:8px 0 0 0',
      'font-size:13px', 'font-weight:600', 'letter-spacing:1px'
    ].join(';'), '智汇排版');
    const fold = el('button', [
      'all:initial', 'cursor:pointer', 'color:#fff', 'font-size:16px', 'line-height:1',
      'padding:0 6px', 'user-select:none', 'font-family:inherit'
    ].join(';'), '—');
    fold.title = '折叠/展开';
    fold.onclick = () => setCollapsed(!collapsed);
    head.appendChild(fold);
    panel.appendChild(head);

    // 主体
    const body = el('div', 'padding:12px;');
    panel.__body = body;

    // 组 1：预设
    body.appendChild(groupTitle('选中文字后点样式'));
    const grid = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:6px;');
    const presets = Array.isArray(window.PRESETS) ? window.PRESETS : [];
    presets.forEach(p => {
      const b = button(p.label);
      b.onclick = () => applyPreset(p);
      grid.appendChild(b);
    });
    body.appendChild(grid);

    // 组 2：整篇
    body.appendChild(groupTitle('整篇'));
    const grid2 = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:6px;');
    const bFull = button('一键全文排版');
    bFull.onclick = fullTextStyle;
    const bClear = button('清除选中格式');
    bClear.onclick = clearFormat;
    grid2.appendChild(bFull);
    grid2.appendChild(bClear);
    body.appendChild(grid2);

    // 组 3：操作
    body.appendChild(groupTitle('操作'));
    const grid3 = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:6px;');
    const bCopy = button('复制富文本');
    bCopy.onclick = copyFormatted;
    const bPush = button('采集到 GitHub');
    bPush.onclick = collectToGitHub;
    bPush.style.background = '#07C160';
    bPush.style.color = '#fff';
    bPush.style.borderColor = '#07C160';
    grid3.appendChild(bCopy);
    grid3.appendChild(bPush);
    body.appendChild(grid3);

    // 底部状态
    statusEl = el('div', 'margin-top:10px;font-size:11px;color:#888;text-align:center;min-height:14px;word-break:break-all;', '就绪');
    body.appendChild(statusEl);

    panel.appendChild(body);
    document.body.appendChild(panel);
    panelEl = panel;

    // 折叠后的竖条点击区
    panel.addEventListener('click', e => {
      if (collapsed && e.target === panel) setCollapsed(false);
    });
  }

  function groupTitle(text) {
    return el('div', 'margin:10px 0 6px;font-size:12px;color:#888;font-weight:500;', text);
  }

  function button(label) {
    const b = el('button', [
      'all:initial', 'display:block', 'padding:7px 4px', 'border:1px solid #d9d9d9',
      'border-radius:4px', 'background:#fafafa', 'color:#333', 'text-align:center',
      'cursor:pointer', 'font-size:12px', 'line-height:1.3', 'font-family:inherit',
      'box-sizing:border-box', 'transition:background .15s'
    ].join(';'), label);
    b.onmouseenter = () => { if (!b.disabled) b.style.background = '#eefaf3'; };
    b.onmouseleave = () => { b.style.background = b.__bg || '#fafafa'; };
    b.__bg = '#fafafa';
    return b;
  }

  function setCollapsed(v) {
    collapsed = v;
    if (!panelEl) return;
    panelEl.style.width = v ? '34px' : '300px';
    panelEl.style.cursor = v ? 'pointer' : 'default';
    if (panelEl.__body) panelEl.__body.style.display = v ? 'none' : 'block';
  }

  function togglePanel() {
    if (!panelEl) { findEditor(); buildPanel(); return; }
    panelEl.style.display = panelEl.style.display === 'none' ? 'block' : 'none';
  }

  // ---------- 选区工具 ----------
  function getRange() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    return sel.getRangeAt(0);
  }

  function reselect(node) {
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(node);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  // ---------- 套用预设 ----------
  function applyPreset(preset) {
    if (!preset || typeof preset.build !== 'function') return;
    const range = getRange();
    if (!range) { showStatus('请先选中文字'); return; }

    // 插入型（分割线）：不要求选中
    if (preset.type === 'insert') {
      const wrap = document.createElement('div');
      wrap.innerHTML = preset.build('');
      const node = wrap.firstElementChild;
      if (!node) return;
      range.collapse(false);
      range.insertNode(node);
      showStatus('已插入·' + preset.label);
      return;
    }

    if (range.collapsed) { showStatus('请先选中文字'); return; }

    const sel = window.getSelection();
    const plain = sel.toString();

    // 代码块吃纯文本（presets.build 内部已做转义）；其它保留选区内已有的标签
    let payload;
    if (preset.id === 'code-block') {
      payload = plain;
    } else {
      const frag = range.extractContents();
      const holder = document.createElement('div');
      holder.appendChild(frag);
      payload = holder.innerHTML || escapeHtml(plain);
    }

    const wrap = document.createElement('div');
    wrap.innerHTML = preset.build(payload);
    const node = wrap.firstElementChild;
    if (!node) { showStatus('样式生成失败'); return; }

    const r = getRange() || range;
    r.insertNode(node);
    reselect(node);
    showStatus('已套用·' + preset.label);
  }

  // ---------- 全文排版 ----------
  function fullTextStyle() {
    if (!editor) { showStatus('没找到编辑器'); return; }
    let count = 0;
    // 只处理编辑器顶层块，避免嵌套替换导致节点失效
    Array.from(editor.children).forEach(node => {
      if (!/^(P|SECTION|DIV)$/.test(node.tagName)) return;
      // 已有字号的是样式容器（标题/代码块/金句），不要覆盖
      if (node.style && node.style.fontSize) return;
      if (node.querySelector && node.querySelector('[style*="font-size"]')) return;
      node.style.fontSize = '16px';
      node.style.lineHeight = '1.75';
      node.style.color = '#3f3f3f';
      node.style.letterSpacing = '0.5px';
      count++;
    });
    // 顶层是纯文本节点时，包一层
    if (count === 0 && editor.textContent.trim() && !editor.querySelector('p,section,div')) {
      const s = document.createElement('section');
      s.setAttribute('style', BASE_TEXT);
      s.innerHTML = editor.innerHTML;
      editor.innerHTML = '';
      editor.appendChild(s);
      count = 1;
    }
    showStatus(`全文排版完成，影响 ${count} 段`);
  }

  // ---------- 清除格式（保留文字！） ----------
  function clearFormat() {
    const range = getRange();
    if (!range || range.collapsed) { showStatus('请先选中文字'); return; }
    const frag = range.extractContents();
    const nodes = frag.nodeType === 1 ? [frag, ...frag.querySelectorAll('*')] : [...frag.querySelectorAll('*')];
    nodes.forEach(n => {
      if (n.nodeType === 1) {
        n.removeAttribute('style');
        n.removeAttribute('class');
        n.removeAttribute('color');
        n.removeAttribute('size');
      }
    });
    range.insertNode(frag);
    showStatus('已清除格式（文字保留）');
  }

  // ---------- 复制富文本 ----------
  function buildExportHtml() {
    return `<section style="${BASE_TEXT}">${editor.innerHTML}</section>`;
  }

  async function copyFormatted() {
    if (!editor) { showStatus('没找到编辑器'); return; }
    const html = buildExportHtml();
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([editor.innerText], { type: 'text/plain' })
        })]);
        showStatus('富文本已复制，可直接粘到编辑器');
        return;
      }
      throw new Error('no clipboard api');
    } catch (e) {
      fallbackCopy(editor.innerText);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showStatus('已复制纯文本（浏览器不支持富文本复制）');
    } catch (e) {
      showStatus('复制失败');
    }
    document.body.removeChild(ta);
  }

  // ---------- 采集到 GitHub ----------
  function getTitle() {
    const cands = [
      '#activity-name', 'input#title', '.title_area input',
      '.appmsg_title input', '.weui-desktop-form__input', 'textarea#title'
    ];
    for (const s of cands) {
      const n = document.querySelector(s);
      if (!n) continue;
      const v = (typeof n.value === 'string' && n.value.trim()) || (n.textContent || '').trim();
      if (v) return v.replace(/\s*[-–—]\s*微信公众平台\s*$/, '').trim();
    }
    return (document.title || '').replace(/\s*[-–—]\s*微信公众平台\s*$/, '').trim();
  }

  function withTimeout(ms) {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  }

  async function collectToGitHub() {
    if (!editor) { showStatus('没找到编辑器'); return; }

    showStatus('检查本地服务…');
    try {
      const p = await fetch(`${API}/ping`, { signal: withTimeout(5000) });
      if (!p.ok) throw new Error('bad');
    } catch (e) {
      showStatus('本地服务没启动，请运行 start-service.cmd');
      return;
    }

    const title = getTitle();
    if (!title) { showStatus('没取到标题，请先填标题'); return; }

    const html = buildExportHtml();
    const markdown = htmlToMarkdown(editor.innerHTML);
    showStatus('正在提交…', 60000);

    try {
      const res = await fetch(`${API}/article`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, markdown, html }),
        signal: withTimeout(60000)
      });
      const data = await res.json();
      if (data && data.ok) {
        showStatus(`已采集 → ${data.path}`, 8000);
      } else {
        showStatus(`采集失败：${(data && data.error) || res.status}`);
      }
    } catch (e) {
      showStatus(`采集出错：${e.name === 'AbortError' ? '超时' : e.message}`);
    }
  }

  // ---------- DOM → Markdown ----------
  function htmlToMarkdown(html) {
    const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html');
    const root = doc.getElementById('r');

    function inline(node) {
      let out = '';
      node.childNodes.forEach(n => {
        if (n.nodeType === 3) { out += n.textContent.replace(/\s+/g, ' '); return; }
        if (n.nodeType !== 1) return;
        const t = n.tagName.toLowerCase();
        if (t === 'br') { out += '  \n'; return; }
        if (t === 'img') { out += `![${n.getAttribute('alt') || ''}](${n.getAttribute('src') || ''})`; return; }
        if (t === 'strong' || t === 'b') { out += `**${inline(n).trim()}**`; return; }
        if (t === 'em' || t === 'i') { out += `*${inline(n).trim()}*`; return; }
        if (t === 'code') { out += '`' + n.textContent + '`'; return; }
        if (t === 'a') { out += `[${inline(n).trim()}](${n.getAttribute('href') || ''})`; return; }
        out += inline(n);
      });
      return out;
    }

    function isCodeBlock(n) {
      const f = (n.style && n.style.fontFamily) || '';
      return /monospace|Consolas|Menlo|Monaco/i.test(f);
    }

    function block(node) {
      let out = '';
      node.childNodes.forEach(n => {
        if (n.nodeType === 3) {
          const t = n.textContent.trim();
          if (t) out += t + '\n\n';
          return;
        }
        if (n.nodeType !== 1) return;
        const tag = n.tagName.toLowerCase();

        if (isCodeBlock(n)) {
          const lines = Array.from(n.querySelectorAll('p')).map(p => {
            // 还原 &nbsp; 缩进
            return p.textContent.replace(/\u00a0/g, ' ');
          });
          out += '```\n' + lines.join('\n') + '\n```\n\n';
          return;
        }
        if (/^h[1-6]$/.test(tag)) {
          out += '#'.repeat(Number(tag[1])) + ' ' + inline(n).trim() + '\n\n';
          return;
        }
        if (tag === 'blockquote') { out += inline(n).trim().split('\n').map(l => '> ' + l).join('\n') + '\n\n'; return; }
        if (tag === 'ul' || tag === 'ol') {
          Array.from(n.children).forEach((li, i) => {
            out += (tag === 'ul' ? '- ' : `${i + 1}. `) + inline(li).trim() + '\n';
          });
          out += '\n';
          return;
        }
        if (tag === 'hr') { out += '---\n\n'; return; }
        if (tag === 'table') {
          const rows = Array.from(n.querySelectorAll('tr'));
          rows.forEach((tr, ri) => {
            const cells = Array.from(tr.children).map(td => inline(td).trim());
            out += '| ' + cells.join(' | ') + ' |\n';
            if (ri === 0) out += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
          });
          out += '\n';
          return;
        }
        if (tag === 'p' || tag === 'section' || tag === 'div') {
          // 分割线（无内容、只有边框）
          if (!n.textContent.trim() && /border-top/.test(n.getAttribute('style') || '')) {
            out += '---\n\n';
            return;
          }
          const hasBlockChild = n.querySelector('p,section,div,ul,ol,table,h1,h2,h3,h4,h5,h6');
          if (hasBlockChild) { out += block(n); return; }
          const t = inline(n).trim();
          if (t) out += t + '\n\n';
          return;
        }
        out += block(n) || inline(n);
      });
      return out;
    }

    return block(root).replace(/\n{3,}/g, '\n\n').trim();
  }

  // ---------- 启动 ----------
  function init() {
    if (document.getElementById('zhp-panel')) return;
    if (findEditor()) {
      buildPanel();
      return;
    }
    if (retry < MAX_RETRY) {
      retry++;
      setTimeout(init, 400);
    }
  }

  // 编辑器异步挂载，用 MutationObserver 兜底
  let mo = null;
  function watch() {
    if (mo || !document.body) return;
    mo = new MutationObserver(() => {
      if (!document.getElementById('zhp-panel') && findEditor()) buildPanel();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  function boot() {
    watch();
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 扩展图标点击 → 显示/隐藏
  try {
    chrome.runtime.onMessage.addListener(msg => {
      if (msg && msg.type === 'ZHP_TOGGLE') {
        if (!panelEl) { findEditor(); buildPanel(); }
        else togglePanel();
      }
    });
  } catch (e) { /* 非扩展环境 */ }
})();
