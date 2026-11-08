// 后台服务：负责和本机 127.0.0.1:7357 通信
// 放在这里而不是 content script，是为了绕开网页的 CSP 和跨域限制
const BASE = 'http://127.0.0.1:7357';

async function ping() {
  try {
    const r = await fetch(`${BASE}/ping`, { cache: 'no-store' });
    const j = await r.json();
    return {
      online: r.ok && j.ok === true,
      repo: j.repo || '',
      repos: Array.isArray(j.repos) ? j.repos : (j.repo ? [j.repo] : []),
      defaultRepo: j.defaultRepo || j.repo || '',
      lastRepo: j.lastRepo || '',
      busy: !!j.busy,
    };
  } catch (e) {
    return { online: false, error: '服务未运行', repos: [] };
  }
}

async function sync(pageId, repo) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5 * 60 * 1000); // 5 分钟上限
  const q = `pageId=${encodeURIComponent(pageId)}` + (repo ? `&repo=${encodeURIComponent(repo)}` : '');
  try {
    const r = await fetch(`${BASE}/sync?${q}`, {
      method: 'POST',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) return { ok: false, error: data.error || `HTTP ${r.status}`, repo: data.repo || repo || '' };
    return { ok: true, file: data.file, repo: data.repo || repo, pushed: data.pushed, reason: data.reason };
  } catch (e) {
    if (e.name === 'AbortError') return { ok: false, error: '同步超时（5 分钟）' };
    return { ok: false, error: '连不上本地同步服务（127.0.0.1:7357）' };
  } finally {
    clearTimeout(timer);
  }
}

async function addRepo(repo, setDefault) {
  try {
    const url = `${BASE}/repos?repo=${encodeURIComponent(repo)}` + (setDefault ? '&default=1' : '');
    const r = await fetch(url, { method: 'POST', cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) return { ok: false, error: d.error || `HTTP ${r.status}` };
    return { ok: true, repos: d.repos, defaultRepo: d.defaultRepo, lastRepo: d.lastRepo };
  } catch (e) {
    return { ok: false, error: '连不上本地同步服务（127.0.0.1:7357）' };
  }
}

async function removeRepo(repo) {
  try {
    const r = await fetch(`${BASE}/repos/remove?repo=${encodeURIComponent(repo)}`, { method: 'POST', cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) return { ok: false, error: d.error || `HTTP ${r.status}` };
    return { ok: true, repos: d.repos, defaultRepo: d.defaultRepo, lastRepo: d.lastRepo };
  } catch (e) {
    return { ok: false, error: '连不上本地同步服务（127.0.0.1:7357）' };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'ping') {
    ping().then(sendResponse);
    return true;
  }
  if (msg.type === 'sync' && msg.pageId) {
    sync(msg.pageId, msg.repo).then(sendResponse);
    return true;
  }
  if (msg.type === 'addRepo' && msg.repo) {
    addRepo(msg.repo, !!msg.default).then(sendResponse);
    return true;
  }
  if (msg.type === 'removeRepo' && msg.repo) {
    removeRepo(msg.repo).then(sendResponse);
    return true;
  }
  return;
});

// 点扩展图标 = 直接同步当前标签页到默认仓库（自动识别页面 ID，不用粘链接）
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function badge(text, color, title) {
  clearTimeout(badge._t);
  chrome.action.setBadgeBackgroundColor({ color: color || '#2d7168' });
  chrome.action.setBadgeText({ text: text || '' });
  chrome.action.setTitle({ title: title || '同步当前 FlowUs 页到 GitHub' });
  if (text) badge._t = setTimeout(() => chrome.action.setBadgeText({ text: '' }), 10000);
}

chrome.action.onClicked.addListener(async (tab) => {
  const url = String((tab && tab.url) || '');
  const m = url.match(UUID_RE);
  if (!m) {
    badge('?', '#9aa0a6', '当前标签不是息流页面：先切到 FlowUs 页面再点我');
    return;
  }
  badge('…', '#9aa0a6', '正在同步（默认仓库）…');
  const res = await sync(m[0]);
  if (!res.ok) {
    badge('✕', '#c0392b', `同步失败：${res.error}`);
    return;
  }
  badge(res.pushed ? '✓' : '=', res.pushed ? '#2d7168' : '#7a7a7a',
    res.pushed ? `已推送到 ${res.repo}：flowus/${res.file}` : `无需提交（${res.reason}）：${res.repo}/flowus/${res.file}`);
});
