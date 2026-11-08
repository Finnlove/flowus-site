// FlowUs 页面注入「同步到 GitHub」按钮：点开面板可以选存到哪个仓库
(function () {
  'use strict';

  if (window.__flowusGhSyncInjected) return;
  window.__flowusGhSyncInjected = true;

  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const Z = 2147483647;

  // ---------- 页面 ID ----------
  function getPageId() {
    let m = location.pathname.match(UUID_RE);
    if (m) return m[0];
    m = (location.hash || '').match(UUID_RE);
    if (m) return m[0];
    const sp = new URLSearchParams(location.search);
    const q = sp.get('pageId') || sp.get('page_id') || sp.get('id');
    if (q && UUID_RE.test(q)) return q.match(UUID_RE)[0];
    m = location.href.match(UUID_RE);
    return m ? m[0] : null;
  }

  // ---------- 与后台通信 ----------
  function ask(payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (res) => {
          if (chrome.runtime.lastError || !res) resolve({ online: false, ok: false, error: '扩展后台未响应' });
          else resolve(res);
        });
      } catch (e) {
        resolve({ online: false, ok: false, error: '扩展已重新加载，请刷新页面' });
      }
    });
  }

  // ---------- 状态 ----------
  const state = {
    online: false,
    repos: [],
    defaultRepo: '',
    lastRepo: '',
    pageId: null,
    syncing: false,
  };

  // ---------- UI ----------
  const root = document.createElement('div');
  root.id = 'flowus-gh-sync';
  root.style.cssText = `position:fixed!important;top:84px!important;right:18px!important;z-index:${Z}!important;display:block!important;font-family:-apple-system,"Microsoft YaHei","Segoe UI",sans-serif!important;user-select:none;`;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.style.cssText = `display:flex!important;align-items:center!important;gap:7px!important;background:#2d7168!important;color:#fff!important;border:none!important;border-radius:9px!important;padding:9px 13px!important;font-size:13.5px!important;font-weight:600!important;font-family:inherit!important;cursor:pointer!important;white-space:nowrap!important;box-shadow:0 3px 12px rgba(0,0,0,.28)!important;visibility:visible!important;opacity:1!important;line-height:1.2!important;`;

  const dot = document.createElement('span');
  dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:#9aa0a6;display:inline-block!important;flex:0 0 auto;`;
  const label = document.createElement('span');
  label.textContent = '同步到 GitHub';
  const caret = document.createElement('span');
  caret.textContent = '▾';
  caret.style.cssText = `font-size:10px!important;opacity:.8!important;margin-left:1px;transition:transform .15s;display:inline-block;`;
  btn.append(dot, label, caret);

  // ---- 面板 ----
  const panel = document.createElement('div');
  panel.style.cssText = `display:none;position:absolute;top:46px;right:0;width:312px;background:#fff!important;color:#2b2b28!important;border:1px solid #e2ded4!important;border-radius:12px!important;box-shadow:0 10px 34px rgba(0,0,0,.24)!important;padding:12px!important;font:13px/1.5 -apple-system,"Microsoft YaHei","Segoe UI",sans-serif!important;box-sizing:border-box!important;`;

  const pTitle = document.createElement('div');
  pTitle.textContent = '保存到哪个仓库';
  pTitle.style.cssText = `font-size:12px!important;font-weight:700!important;color:#78746a!important;letter-spacing:.3px;margin:0 0 8px 2px!important;`;

  const pSub = document.createElement('div');
  pSub.style.cssText = `font:11.5px/1.5 Consolas,ui-monospace,monospace!important;color:#9a9488!important;margin:0 0 8px 2px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;`;

  const list = document.createElement('div');
  list.style.cssText = `display:flex!important;flex-direction:column!important;gap:6px!important;max-height:300px!important;overflow:auto!important;`;

  const addWrap = document.createElement('div');
  addWrap.style.cssText = `display:none;gap:6px!important;margin-top:8px!important;`;

  const addInput = document.createElement('input');
  addInput.type = 'text';
  addInput.placeholder = 'owner/name';
  addInput.style.cssText = `flex:1!important;min-width:0!important;padding:7px 9px!important;font-size:12.5px!important;font-family:inherit!important;border:1px solid #d5d0c5!important;border-radius:7px!important;background:#fdfcf9!important;color:inherit!important;outline:none!important;box-sizing:border-box!important;`;

  const addOk = document.createElement('button');
  addOk.type = 'button';
  addOk.textContent = '加';
  addOk.style.cssText = `padding:7px 11px!important;font-size:12.5px!important;font-weight:600!important;font-family:inherit!important;background:#2d7168!important;color:#fff!important;border:none!important;border-radius:7px!important;cursor:pointer!important;flex:0 0 auto;`;

  addWrap.append(addInput, addOk);

  const foot = document.createElement('div');
  foot.style.cssText = `display:flex!important;justify-content:space-between!important;align-items:center!important;margin-top:10px!important;padding-top:9px!important;border-top:1px solid #eeeae0!important;`;

  const addToggle = document.createElement('button');
  addToggle.type = 'button';
  addToggle.textContent = '＋ 添加仓库';
  addToggle.style.cssText = `background:none!important;border:none!important;padding:2px 0!important;font-size:12px!important;font-family:inherit!important;color:#2d7168!important;cursor:pointer!important;font-weight:600!important;`;

  const panelLink = document.createElement('a');
  panelLink.href = 'http://127.0.0.1:7357/';
  panelLink.target = '_blank';
  panelLink.rel = 'noopener';
  panelLink.textContent = '控制面板 ↗';
  panelLink.style.cssText = `font-size:12px!important;color:#9a9488!important;text-decoration:none!important;`;

  foot.append(addToggle, panelLink);

  const status = document.createElement('div');
  status.style.cssText = `display:none;margin-top:9px!important;padding:8px 10px!important;border-radius:8px!important;font:11.5px/1.6 Consolas,ui-monospace,monospace!important;white-space:pre-wrap!important;word-break:break-word!important;background:#f4f2ec!important;color:#4a4740!important;`;

  panel.append(pTitle, pSub, list, addWrap, foot, status);
  root.append(btn, panel);

  function say(text, kind) {
    status.textContent = text;
    status.style.display = text ? 'block' : 'none';
    status.style.background = kind === 'error' ? '#fbe2dc' : kind === 'ok' ? '#dff0e2' : '#f4f2ec';
    status.style.color = kind === 'error' ? '#8d2f21' : kind === 'ok' ? '#1f6b38' : '#4a4740';
    clearTimeout(status._t);
    if (kind === 'ok' || kind === 'error') {
      status._t = setTimeout(() => { if (status.style.display === 'block') status.textContent = ''; }, 20000);
    }
  }

  function setDot(color) {
    dot.style.background = color;
  }

  function setOpen(v) {
    state.open = v;
    panel.style.display = v ? 'block' : 'none';
    caret.style.transform = v ? 'rotate(180deg)' : 'none';
    root.style.setProperty('z-index', String(Z), 'important');
    if (v) {
      const pid = getPageId();
      state.pageId = pid;
      pSub.textContent = pid ? `页 ${pid}` : '⚠️ 认不出当前页 ID';
      say('');
      refresh(); // 打开时拉一次仓库列表
    } else {
      addWrap.style.display = 'none';
    }
  }

  // ---- 仓库列表渲染 ----
  function repoRow(name, meta) {
    const row = document.createElement('button');
    row.type = 'button';
    row.style.cssText = `display:flex!important;align-items:center!important;gap:8px!important;width:100%!important;padding:9px 10px!important;border:1px solid #e2ded4!important;border-radius:9px!important;background:#fdfcf9!important;cursor:pointer!important;font-family:inherit!important;text-align:left!important;box-sizing:border-box!important;transition:background .15s,border-color .15s;`;

    const txt = document.createElement('div');
    txt.style.cssText = `flex:1!important;min-width:0!important;display:flex!important;flex-direction:column!important;gap:2px!important;`;
    const nm = document.createElement('span');
    nm.textContent = name;
    nm.style.cssText = `font-size:13px!important;font-weight:600!important;color:#2b2b28!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;`;
    txt.appendChild(nm);

    if (meta) {
      const badge = document.createElement('span');
      badge.textContent = meta;
      badge.style.cssText = `font-size:10.5px!important;color:#2d7168!important;background:#e4efec!important;border-radius:999px!important;padding:1px 7px!important;align-self:flex-start!important;`;
      txt.appendChild(badge);
    }

    const go = document.createElement('span');
    go.textContent = '同步 ›';
    go.style.cssText = `font-size:11.5px!important;font-weight:700!important;color:#2d7168!important;flex:0 0 auto;`;

    row.append(txt, go);

    row.addEventListener('mouseenter', () => { row.style.borderColor = '#2d7168'; row.style.background = '#f2f8f6'; });
    row.addEventListener('mouseleave', () => { row.style.borderColor = '#e2ded4'; row.style.background = '#fdfcf9'; });
    row.addEventListener('click', () => { if (!state.syncing) doSync(name); });
    return row;
  }

  function renderList() {
    list.textContent = '';
    const repos = state.repos.slice();
    // 上次用过的排最前，方便直接点
    const last = state.lastRepo;
    if (last && repos.includes(last)) {
      repos.sort((a, b) => (a === last ? -1 : b === last ? 1 : 0));
    }
    if (!repos.length) {
      const empty = document.createElement('div');
      empty.textContent = state.online
        ? '还没有配置仓库，用下面「＋ 添加仓库」加一个'
        : '本地服务没在运行 —— 双击 start-service.cmd 启动后再点按钮';
      empty.style.cssText = `font-size:12px!important;color:#9a9488!important;padding:6px 2px!important;`;
      list.appendChild(empty);
      return;
    }
    repos.forEach((r) => {
      const meta = r === last ? (r === state.defaultRepo ? '上次 · 默认' : '上次使用')
        : (r === state.defaultRepo ? '默认' : '');
      list.appendChild(repoRow(r, meta));
    });
  }

  // ---------- 服务状态 / 仓库列表 ----------
  async function refresh() {
    const res = await ask({ type: 'ping' });
    state.online = !!res.online;
    if (res.online) {
      state.repos = Array.isArray(res.repos) ? res.repos : (res.repo ? [res.repo] : []);
      state.defaultRepo = res.defaultRepo || res.repo || '';
      state.lastRepo = res.lastRepo || '';
      setDot('#5ce07a');
      btn.title = `本地服务在线 · 默认仓库 ${state.defaultRepo}`;
    } else {
      setDot('#ff7a5c');
      btn.title = '本地同步服务没在运行，点我查看怎么启动';
    }
    if (state.open) renderList();
    return state.online;
  }

  // ---------- 添加仓库 ----------
  function showAdd(show) {
    addWrap.style.display = show ? 'flex' : 'none';
    if (show) addInput.focus();
  }

  addToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    showAdd(addWrap.style.display === 'none');
    if (addWrap.style.display === 'flex') say('输入 owner/name，例如 Finnlove/workbook');
  });

  addOk.addEventListener('click', async (e) => {
    e.stopPropagation();
    const v = addInput.value.trim();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(v)) { say('❌ 格式应为 owner/name', 'error'); return; }
    addOk.disabled = true;
    const res = await ask({ type: 'addRepo', repo: v });
    addOk.disabled = false;
    if (!res.ok) { say('❌ ' + (res.error || '添加失败'), 'error'); return; }
    state.repos = res.repos || state.repos;
    state.defaultRepo = res.defaultRepo || state.defaultRepo;
    state.lastRepo = res.lastRepo || v;
    addInput.value = '';
    showAdd(false);
    say(`✅ 已加入列表：${v}\n点它就能同步过去`);
    renderList();
  });

  addInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') addOk.click();
    if (e.key === 'Escape') showAdd(false);
  });

  // ---------- 同步 ----------
  async function doSync(repo) {
    const pageId = state.pageId || getPageId();
    if (!pageId) {
      say('❌ 认不出当前页 ID。\n请确认地址栏是 https://flowus.cn/<一串ID> 这种形式。', 'error');
      return;
    }

    state.syncing = true;
    btn.disabled = true;
    setDot('#ffcf5c');
    say(`⏳ 正在同步 → ${repo}\n页 ${pageId}\n约 10–60 秒，别关页面`);
    const t0 = Date.now();
    const res = await ask({ type: 'sync', pageId, repo });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    state.syncing = false;
    btn.disabled = false;

    if (res.ok) {
      setDot('#5ce07a');
      state.lastRepo = res.repo || repo;
      say(
        `✅ 已保存到 ${res.repo || repo}（${secs}s）\n` +
        `flowus/${res.file}\n` +
        (res.pushed ? '已提交到 GitHub' : `仓库已是最新（${res.reason === 'no-change' ? '内容无变化' : res.reason}）`) +
        `\nhttps://github.com/${res.repo || repo}`,
        'ok'
      );
      renderList();
    } else {
      setDot('#ff7a5c');
      const offline = /连不上|服务未运行|未响应/.test(res.error || '');
      say(
        '❌ ' + (res.error || '同步失败') + '\n' +
        (offline
          ? '本地服务没启动。双击插件目录里的 start-service.cmd 启动，然后重新点一次。'
          : '详细原因看服务窗口里的日志。'),
        'error'
      );
    }
  }

  // ---------- 点击按钮：展开/收起面板 ----------
  let moved = false;
  btn.addEventListener('click', () => {
    if (moved) { moved = false; return; } // 拖动结束不当作点击
    setOpen(!state.open);
  });

  // 点面板外面收起
  document.addEventListener('mousedown', (e) => {
    if (!state.open) return;
    if (!root.contains(e.target)) setOpen(false);
  }, true);

  function mount() {
    if (!document.documentElement) return;
    if (!root.isConnected) document.documentElement.appendChild(root);
  }

  // 可拖动，避免压住 FlowUs 自己的按钮
  btn.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const r = root.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY, ox = r.left, oy = r.top;
    moved = false;
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (!moved) return;
      root.style.setProperty('top', `${oy + dy}px`, 'important');
      root.style.setProperty('right', 'auto', 'important');
      root.style.setProperty('left', `${ox + dx}px`, 'important');
      // 拖到右下角时面板会溢出，靠右对齐面板更稳
      panel.style.right = (ox + dx) > window.innerWidth - 360 ? '0' : 'auto';
      panel.style.left = (ox + dx) > window.innerWidth - 360 ? 'auto' : '0';
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });

  // ---------- 启动 ----------
  mount();
  const watchdog = setInterval(() => {
    mount();
    if (document.getElementById('flowus-gh-sync') !== root) clearInterval(watchdog);
  }, 1500);
  new MutationObserver(() => { if (!root.isConnected) mount(); })
    .observe(document.documentElement, { childList: true });

  setTimeout(refresh, 500);
  setInterval(() => { if (!state.open) refresh(); }, 20000);

  console.log(
    `%c[FlowUs→GitHub] 按钮已注入 v1.2.0%c  当前页ID: ${getPageId() || '未识别'}`,
    'background:#2d7168;color:#fff;padding:2px 6px;border-radius:4px',
    'color:#666'
  );
})();
