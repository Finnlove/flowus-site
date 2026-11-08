// ==UserScript==
// @name         FlowUs → GitHub 同步按钮
// @namespace    flowus-github-sync
// @version      1.2.0
// @description  在 FlowUs 页面注入「同步到 GitHub」悬浮按钮，点击后调用本机同步服务把当前页推送到 GitHub 仓库的 flowus/ 子目录
// @author       Finnlove
// @match        https://flowus.cn/*
// @match        https://*.flowus.cn/*
// @match        http://flowus.cn/*
// @match        http://*.flowus.cn/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @connect      127.0.0.1
// @connect      localhost
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ==================== 配置 ====================
  const PORT = 7357;
  const BASE = `http://127.0.0.1:${PORT}`;
  const REPO = 'Finnlove/workbook';
  const SYNC_SCRIPT = 'C:\\Users\\123\\.flowus-github-sync\\sync.js';
  const Z = 2147483000;

  // ==================== pageId 提取 ====================
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  function getPageId() {
    // 1) 路径：https://flowus.cn/<uuid>/...
    let m = location.pathname.match(UUID_RE);
    if (m) return m[0];
    // 2) hash 路由：https://flowus.cn/#/<uuid>
    m = (location.hash || '').match(UUID_RE);
    if (m) return m[0];
    // 3) query：?pageId=<uuid>
    const sp = new URLSearchParams(location.search);
    const q = sp.get('pageId') || sp.get('page_id') || sp.get('id');
    if (q && UUID_RE.test(q)) return q.match(UUID_RE)[0];
    // 4) 整条 URL 兜底
    m = location.href.match(UUID_RE);
    return m ? m[0] : null;
  }

  // ==================== 网络请求（绕过页面 CSP） ====================
  function hasGM() {
    return typeof GM_xmlhttpRequest === 'function';
  }

  function request(path, method = 'GET') {
    const url = BASE + path;
    if (hasGM()) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method,
          url,
          timeout: 300000,
          onload: (r) => {
            let data = {};
            try { data = JSON.parse(r.responseText || '{}'); } catch { data = { raw: r.responseText }; }
            resolve({ status: r.status, ok: r.status >= 200 && r.status < 300, data });
          },
          onerror: () => reject(new Error('NETWORK')),
          ontimeout: () => reject(new Error('TIMEOUT')),
        });
      });
    }
    return fetch(url, { method }).then(async (r) => {
      let data = {};
      try { data = await r.json(); } catch { data = {}; }
      return { status: r.status, ok: r.ok, data };
    }).catch(() => { throw new Error('NETWORK'); });
  }

  // ==================== UI ====================
  const root = document.createElement('div');
  root.id = 'flowus-gh-sync-panel';
  root.style.cssText = `
    position: fixed !important; top: 84px !important; right: 18px !important;
    z-index: ${Z} !important; display: block !important;
    font-family: -apple-system, "Microsoft YaHei", "Segoe UI", sans-serif !important;
    user-select: none; -webkit-user-select: none;
  `;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '同步到 GitHub';
  btn.style.cssText = `
    display: flex !important; align-items: center; gap: 7px;
    background: #2d7168 !important; color: #fff !important;
    border: none !important; border-radius: 9px !important;
    padding: 9px 15px !important; font-size: 13.5px !important; font-weight: 600 !important;
    font-family: inherit !important; cursor: pointer !important; white-space: nowrap !important;
    box-shadow: 0 3px 12px rgba(0,0,0,.28) !important;
    opacity: 1 !important; visibility: visible !important;
  `;

  const dot = document.createElement('span');
  dot.style.cssText = `
    width: 8px; height: 8px; border-radius: 50%;
    background: #9aa0a6; display: inline-block; flex: 0 0 auto;
    transition: background .2s;
  `;
  btn.prepend(dot);

  const tip = document.createElement('div');
  tip.style.cssText = `
    display: none; position: absolute; top: 44px; right: 0;
    width: 320px; background: rgba(24,29,37,.96) !important; color: #dfe4ea !important;
    border-radius: 10px; padding: 11px 13px;
    font: 12.5px/1.65 Consolas, ui-monospace, monospace !important;
    white-space: pre-wrap; word-break: break-word;
    box-shadow: 0 6px 22px rgba(0,0,0,.35);
  `;

  root.appendChild(btn);
  root.appendChild(tip);

  function showTip(text, kind) {
    tip.textContent = text;
    tip.style.display = 'block';
    tip.style.color = kind === 'error' ? '#ff9d80' : kind === 'ok' ? '#93e6a4' : '#dfe4ea';
    clearTimeout(tip._t);
    if (kind !== 'busy') tip._t = setTimeout(() => (tip.style.display = 'none'), kind === 'error' ? 15000 : 7000);
  }

  function setDot(state) {
    dot.style.background = state === 'ok' ? '#5ce07a' : state === 'bad' ? '#ff7a5c' : state === 'busy' ? '#ffcf5c' : '#9aa0a6';
  }

  // 挂载：优先 HTML 根节点，避免被 SPA 重渲染把 body 子节点清掉
  function mount() {
    if (!document.documentElement) return;
    if (!root.isConnected) document.documentElement.appendChild(root);
  }

  // 拖动（万一按钮压住 FlowUs 自己的工具栏，可以拖走）
  (function makeDraggable() {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    btn.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const r = root.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      dragging = false;
      const move = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!dragging && Math.abs(dx) + Math.abs(dy) > 4) dragging = true;
        if (!dragging) return;
        root.style.setProperty('top', `${oy + dy}px`, 'important');
        root.style.setProperty('right', 'auto', 'important');
        root.style.setProperty('left', `${ox + dx}px`, 'important');
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        if (dragging) btn._dragged = true;
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  })();

  // ==================== 服务状态探测 ====================
  async function ping(silent) {
    try {
      const r = await request('/ping');
      if (r.ok && r.data && r.data.ok) {
        setDot('ok');
        btn.title = `服务在线 · 目标仓库 ${r.data.repo}${r.data.busy ? ' · 正在同步中' : ''}`;
        if (!silent) showTip(`✅ 本地服务在线\n目标仓库: ${r.data.repo}`, 'ok');
        return true;
      }
      setDot('bad');
      return false;
    } catch {
      setDot('bad');
      btn.title = '本地同步服务未运行（点我查看如何启动）';
      if (!silent) {
        showTip(
          '❌ 本地同步服务没有运行。\n\n' +
          '先打开一个终端窗口执行：\n' +
          `  node "${SYNC_SCRIPT}" --serve\n\n` +
          '看到 "本地同步服务已启动" 后再点按钮。',
          'error'
        );
      }
      return false;
    }
  }

  // ==================== 点击同步 ====================
  btn.addEventListener('click', async () => {
    if (btn._dragged) { btn._dragged = false; return; } // 拖动结束不触发同步

    const pageId = getPageId();
    if (!pageId) {
      showTip('❌ 认不出当前页 ID。\n请在 FlowUs 页面上再点一次，或直接把链接粘到\nhttp://127.0.0.1:7357/ 里同步。', 'error');
      return;
    }

    btn.disabled = true;
    setDot('busy');
    showTip(`⏳ 正在同步…\n页 ID: ${pageId}\n目标: ${REPO}/flowus/`, 'busy');
    const t0 = Date.now();

    try {
      const r = await request(`/sync?pageId=${encodeURIComponent(pageId)}`, 'POST');
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      if (!r.ok || r.data.error) throw new Error(r.data.error || `HTTP ${r.status}`);
      setDot('ok');
      showTip(`✅ 同步成功（${secs}s）\n文件: flowus/${r.data.file}\nhttps://github.com/${r.data.repo}`, 'ok');
    } catch (e) {
      const msg = String(e.message || e);
      if (msg === 'NETWORK' || msg === 'Failed to fetch' || /Failed to fetch/i.test(msg)) {
        setDot('bad');
        showTip(
          '❌ 连不上本地服务（127.0.0.1:7357）。\n\n' +
          '1) 确认终端里已经运行：\n' +
          `   node "${SYNC_SCRIPT}" --serve\n\n` +
          '2) 浏览器打开 http://127.0.0.1:7357/ping\n' +
          '   能看到 {"ok":true} 就说明服务正常\n\n' +
          '3) 若仍失败，直接用控制面板：\n' +
          '   http://127.0.0.1:7357/',
          'error'
        );
      } else if (msg === 'TIMEOUT') {
        setDot('bad');
        showTip('❌ 同步超时（5 分钟）。\n可能是 git 网络慢，看终端日志确认卡在哪一步。', 'error');
      } else {
        setDot('bad');
        showTip(`❌ 同步失败\n${msg.slice(0, 600)}`, 'error');
      }
    } finally {
      btn.disabled = false;
    }
  });

  // ==================== 启动 ====================
  mount();
  // SPA 重渲染 / 懒加载 body 时补挂
  const watchdog = setInterval(() => {
    mount();
    if (document.getElementById('flowus-gh-sync-panel') !== root) clearInterval(watchdog);
  }, 1500);
  new MutationObserver(() => { if (!root.isConnected) mount(); })
    .observe(document.documentElement, { childList: true });

  setTimeout(() => ping(true), 600);
  setInterval(() => ping(true), 20000);

  // 控制台留个标记，方便确认脚本确实跑起来了
  console.log(
    `%c[FlowUs→GitHub] 脚本已加载 v1.2.0%c\n请求方式: ${hasGM() ? 'GM_xmlhttpRequest' : 'fetch'}\n当前页 ID: ${getPageId() || '(未识别)'}`,
    'background:#2d7168;color:#fff;padding:2px 6px;border-radius:4px',
    'color:#666'
  );
})();
