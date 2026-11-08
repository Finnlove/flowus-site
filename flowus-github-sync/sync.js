#!/usr/bin/env node
/**
 * FlowUs 当前页 → GitHub 同步脚本
 *
 * 用法：
 *   node sync.js <pageId>                 # 同步指定页
 *   node sync.js <pageId> --dry-run       # 只导出 markdown 不推送
 *   node sync.js <pageId> --repo <url>   # 指定仓库（默认 Finnlove/workbook）
 *
 * 行为：
 *   1. flowus markdown get <pageId> 导出当前页 markdown
 *   2. 用 GitHub Contents API 直接写 flowus/<页标题>.md（单请求 KB 级，网络抖也能过）
 *      —— 拿不到 token 或 --transport git 时，退回 git 浅克隆 + commit + push 通道
 *   4. 只碰 flowus/ 下的同名文件，不改仓库其它内容；内容没变不产生空提交
 *
 * 凭据：~/.git-credentials 里的 github.com token
 *       FlowUs 用 ~/.flowus OAuth 存储凭据
 * 网络：先试直连 api.github.com，不通再自动探测本地代理（--proxy 可手动指定）
 */
const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------- 代理支持（只作用于 git，FlowUs CLI 始终直连） ----------
let gitExtraEnv = {};
let proxySource = '未使用';
let currentProxy = null;      // 当前生效代理（curl/API 通道用）

// 常见本地代理端口，按你机器上实际在跑的优先排序
const PROXY_CANDIDATES = [
  'socks5h://127.0.0.1:4080',   // 便携版 Chrome 启动器用的那个
  'http://127.0.0.1:7890',      // clash / mihomo 默认
  'socks5h://127.0.0.1:7891',
  'http://127.0.0.1:7897',      // clash verge
  'http://127.0.0.1:10809',     // v2rayN http
  'socks5h://127.0.0.1:10808',  // v2rayN socks
  'socks5h://127.0.0.1:1080',
  'http://127.0.0.1:2080',
];

const NO_PROXY_ENV = {
  HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '',
  http_proxy: '', https_proxy: '', all_proxy: '',
  GIT_HTTP_LOW_SPEED_LIMIT: '1', GIT_HTTP_LOW_SPEED_TIME: '60',
};

function applyProxy(url, source) {
  currentProxy = url || null; // curl / API 通道使用
  if (!url) {
    gitExtraEnv = { ...NO_PROXY_ENV };
    proxySource = '直连（已清空残留代理变量）';
    return null;
  }
  gitExtraEnv = {
    ...NO_PROXY_ENV,
    HTTP_PROXY: url, HTTPS_PROXY: url, ALL_PROXY: url,
    http_proxy: url, https_proxy: url, all_proxy: url,
  };
  proxySource = source ? `${source}: ${url}` : url;
  return url;
}

function proxyPortOf(url) {
  try {
    const u = new URL(url);
    return Number(u.port || (u.protocol.startsWith('socks') ? 1080 : 8080));
  } catch { return 0; }
}

// 端口是否有人在听（1.2 秒超时，比探测整条链路快得多）
function portOpen(port, timeout = 1200) {
  return new Promise((resolve) => {
    const net = require('net');
    const s = net.connect(port, '127.0.0.1');
    let done = false;
    const end = (ok) => { if (done) return; done = true; s.destroy(); resolve(ok); };
    s.setTimeout(timeout);
    s.once('connect', () => end(true));
    s.once('timeout', () => end(false));
    s.once('error', () => end(false));
  });
}

// 真正用 git 试一次，确认这个代理能到 GitHub（代理链路会抖，默认试 2 次）
function gitReachable(proxyUrl, repo, attempts = 2) {
  const env = { ...process.env, ...NO_PROXY_ENV };
  if (proxyUrl) {
    Object.assign(env, {
      HTTP_PROXY: proxyUrl, HTTPS_PROXY: proxyUrl, ALL_PROXY: proxyUrl,
      http_proxy: proxyUrl, https_proxy: proxyUrl, all_proxy: proxyUrl,
    });
  }
  for (let i = 0; i < attempts; i++) {
    try {
      execSync(`git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=15 ls-remote --heads "https://github.com/${repo}.git"`, {
        encoding: 'utf8', timeout: 40000, stdio: 'pipe', env,
      });
      return true;
    } catch { /* 换一次连接再试 */ }
  }
  return false;
}

const PROXY_CACHE = path.join(os.homedir(), '.flowus-github-sync.proxy');
const CONFIG_PATH = path.join(os.homedir(), '.flowus-github-sync', 'config.json');

function readProxyCache() {
  try { return fs.readFileSync(PROXY_CACHE, 'utf8').trim() || null; } catch { return null; }
}
function writeProxyCache(url) {
  try { fs.writeFileSync(PROXY_CACHE, url + '\n', 'utf8'); } catch {}
}

function isValidRepo(repo) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repo || '').trim());
}
function loadConfig() {
  try {
    const j = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return j && typeof j === 'object' ? j : {};
  } catch { return {}; }
}
function saveConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  } catch {}
}
function getRepoConfig(defaultRepo) {
  const cfg = loadConfig();
  const repos = [];
  const add = (r) => { r = String(r || '').trim(); if (isValidRepo(r) && !repos.includes(r)) repos.push(r); };
  add(defaultRepo);
  if (Array.isArray(cfg.repos)) cfg.repos.forEach(add);
  const def = isValidRepo(cfg.defaultRepo) ? cfg.defaultRepo : defaultRepo;
  add(def);
  const last = isValidRepo(cfg.lastRepo) && repos.includes(cfg.lastRepo) ? cfg.lastRepo : null;
  return { repos, defaultRepo: repos.includes(def) ? def : repos[0] || defaultRepo, lastRepo: last };
}

// 记住某个仓库（加入列表 + 记为「上次使用」），不改变默认仓库
function noteRepo(defaultRepo, repo) {
  repo = String(repo || '').trim();
  if (!isValidRepo(repo)) return;
  const cfg = loadConfig();
  const { repos, defaultRepo: def } = getRepoConfig(defaultRepo);
  if (!repos.includes(repo)) repos.push(repo);
  saveConfig({ ...cfg, repos, defaultRepo: def, lastRepo: repo });
}

// 手动添加仓库；setDefault 为 true 时同时设为默认
function addRepo(defaultRepo, repo, setDefault) {
  repo = String(repo || '').trim();
  if (!isValidRepo(repo)) return null;
  const cfg = loadConfig();
  const { repos, defaultRepo: def } = getRepoConfig(defaultRepo);
  if (!repos.includes(repo)) repos.push(repo);
  const nextDef = setDefault ? repo : def;
  saveConfig({ ...cfg, repos, defaultRepo: nextDef, lastRepo: repo });
  return { repos, defaultRepo: nextDef, lastRepo: repo };
}

// 从列表移除；默认仓库被移除后自动顺延到下一个
function removeRepo(defaultRepo, repo) {
  repo = String(repo || '').trim();
  const cfg = loadConfig();
  const { repos, defaultRepo: def } = getRepoConfig(defaultRepo);
  let next = repos.filter((r) => r !== repo);
  if (!next.length) next = [def];
  const nextDef = def === repo ? next[0] : def;
  const nextLast = cfg.lastRepo === repo ? next[0] : (isValidRepo(cfg.lastRepo) ? cfg.lastRepo : null);
  saveConfig({ ...cfg, repos: next, defaultRepo: nextDef, lastRepo: nextLast });
  return { repos: next, defaultRepo: nextDef, lastRepo: nextLast };
}

// 用 curl 快速判断 API 端是否可达（比 git ls-remote 快一个数量级，也和实际用的通道一致）
function curlReachable(proxyUrl, attempts = 2, url = 'https://api.github.com') {
  const args = ['-s', '-o', 'NUL', '-w', '%{http_code}', '--max-time', '12'];
  if (proxyUrl) args.push('--proxy', proxyUrl);
  args.push(url);
  for (let i = 0; i < attempts; i++) {
    try {
      const out = String(execFileSync('curl.exe', args, { encoding: 'utf8', timeout: 20000 })).trim();
      if (out === '200' || out === '401' || out === '403') return true; // 401/403 也算网络通（只是没带 token）
    } catch {}
  }
  return false;
}

// 依次判断：命令行 --proxy → 环境变量 → 直连（API 通道） → 上次成功的 → 自动探测
async function setupProxy(opts) {
  if (opts.proxy) {
    applyProxy(opts.proxy, '命令行 --proxy');
    console.log(`[proxy] ${proxySource}`);
    return;
  }

  const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy
    || process.env.HTTP_PROXY || process.env.http_proxy;
  if (envProxy) {
    applyProxy(envProxy, '环境变量');
    console.log(`[proxy] ${proxySource}`);
    return;
  }

  const useGit = opts.transport === 'git';

  // API 通道：能直连就直连（最稳，不受代理节点抖动影响）
  if (!useGit && curlReachable(null, 2)) {
    applyProxy(null);
    console.log('[proxy] api.github.com 可直连，不走代理');
    return;
  }

  // 上次探测成功的，端口还开着就直接用（省掉每次探测）
  const cached = opts.forceProbe ? null : readProxyCache();
  if (cached) {
    const port = proxyPortOf(cached);
    if (port && await portOpen(port)) {
      applyProxy(cached, '上次成功的');
      console.log(`[proxy] ${proxySource}`);
      return;
    }
  }

  // 看本地有没有代理端口在听（毫秒级）
  const openPorts = [];
  for (const url of PROXY_CANDIDATES) {
    if (await portOpen(proxyPortOf(url))) openPorts.push(url);
  }

  if (openPorts.length) {
    console.log(`[proxy] 发现本地代理端口: ${openPorts.join(', ')}`);
    for (const url of openPorts) {
      process.stdout.write(`        验证 ${url} … `);
      const ok = useGit ? gitReachable(url, opts.repo, 2) : curlReachable(url, 2);
      if (ok) {
        console.log('可用 ✅');
        applyProxy(url, '自动探测');
        writeProxyCache(url);
        console.log(`[proxy] ${proxySource}`);
        return;
      }
      console.log('暂时不通');
    }
    // 端口在听但链路暂时不稳（代理节点抖动）：仍然用它，同步阶段还会重试换连接
    applyProxy(openPorts[0], '自动探测（端口在听，链路暂时不稳）');
    writeProxyCache(openPorts[0]);
    console.log(`[proxy] ${proxySource}`);
    return;
  }

  // 没有任何代理端口：直连兜底
  applyProxy(null);
  console.log('[proxy] 没发现本地代理端口，尝试直连');
}

// ---------- 解析参数 ----------
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { repo: 'Finnlove/workbook', branch: null, dryRun: false, serve: false };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--serve') opts.serve = true;
    else if (a === '--repo') opts.repo = args[++i];
    else if (a === '--branch') opts.branch = args[++i];
    else if (a === '--proxy') opts.proxy = args[++i];
    else if (a === '--transport') opts.transport = args[++i];
    else positional.push(a);
  }
  opts.pageId = positional[0];
  return opts;
}

function sh(cmd, opts = {}) {
  // 把 stdout/stderr 都捕获，避免 PowerShell 编码坑；用 cmd 直接调 git（Windows 下 git 走 cmd）
  const base = {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 50 * 1024 * 1024,
  };
  // 只有 git 命令注入代理环境，flowus CLI 保持直连
  const isGit = /(^|&&|&|\|\|)\s*git\s/.test(cmd);
  if (isGit) {
    base.env = { ...process.env, ...gitExtraEnv };
    // 你的全局 gitconfig 里有 http.lowSpeedLimit=0 / lowSpeedTime=999999，
    // 走代理抖动时会永久挂死（实测挂到 185 秒）。用命令行 -c 覆盖成"卡 30 秒就放弃"，
    // 失败交回重试逻辑换一条连接，比干等强得多。
    cmd = cmd.replace(
      /(^|&&|&|\|\|)(\s*)git\s/,
      (m, p, s) => `${p}${s}git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 `
    );
  }
  const out = execSync(cmd, { ...base, ...opts });
  return out.trim();
}

// ---------- 1. 导出 FlowUs 当前页 markdown ----------
function exportFlowusMarkdown(pageId) {
  console.log(`[1/4] flowus markdown get ${pageId} ...`);
  const tmp = path.join(os.tmpdir(), `flowus-sync-${pageId}.json`);
  sh(`flowus --json markdown get ${pageId} > "${tmp}"`);
  const j = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  const markdown = j.data?.markdown ?? j.data?.content;
  if (markdown == null) throw new Error('flowus markdown get 未返回 markdown 字段');
  // 页标题：flowus page get 取
  const titleJson = sh(`flowus --json page get ${pageId}`);
  const tj = JSON.parse(titleJson);
  const title = tj.data?.properties?.title?.title?.[0]?.text?.content
      ?? tj.data?.title?.[0]?.text?.content
      ?? pageId;
  fs.unlinkSync(tmp);
  console.log(`      页标题: ${title}`);
  return { title, markdown };
}

// ---------- 文件名安全化 ----------
function safeFilename(name) {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')   // Windows 非法字符
    .replace(/[\u4e00-\u9fa5]/g, m => m) // 保留中文
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'untitled';
}

// ---------- 带重试的操作（GitHub 走代理时会偶发 TLS 握手失败 / 连接重置） ----------
const NET_ERR_RE = /unable to access|Connection was reset|Could not resolve|timed out|ETIMEDOUT|ECONNRESET|handshake|Recv failure|Failed to connect|Operation too slow|early EOF|unexpected disconnect|Empty reply|curl 请求失败|curl: \((6|7|28|35|52|55|56)\)|HTTP (5\d\d|429)/i;

function sleepMs(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {}
}

function retry(times, label, fn) {
  let last = null;
  let attempts = times;
  for (let i = 1; i <= attempts; i++) {
    const t0 = Date.now();
    try {
      return fn(i);
    } catch (e) {
      last = e;
      const msg = String((e && e.message) || e);
      const isNet = NET_ERR_RE.test(msg);
      const fastFail = Date.now() - t0 < 5000;
      // 秒失败基本都是代理链路抖一下，多试几次成本极低，直接抬到 6 次
      if (isNet && fastFail && attempts < 6) attempts = 6;
      if (i < attempts) {
        const wait = isNet ? Math.min(4000, 800 * i) : 500;
        console.log(`      ${label} 失败（第 ${i}/${attempts} 次${isNet ? '，网络抖动' : ''}），${wait}ms 后重试…`);
        sleepMs(wait);
      }
    }
  }
  const msg = String((last && last.message) || last);
  if (NET_ERR_RE.test(msg)) {
    throw new Error(
      `${label} 连续 ${attempts} 次失败，网络无法访问 github.com（当前代理: ${proxySource}）。\n` +
      `请检查：1) 代理软件是否在运行（本地端口是否在听）  2) 用 --proxy 手动指定，如 --proxy socks5h://127.0.0.1:4080\n` +
      `原始错误：${msg.slice(0, 300)}`
    );
  }
  throw last;
}

// ---------- 2. 准备仓库（缓存目录，始终对齐远端最新） ----------
function prepareRepo(repo, branch, dryRun) {
  // 复用本地缓存，避免每次全量 clone。每次都把工作区硬重置到远端 HEAD：
  // 踩过的坑 —— 用 pull --rebase 时，同一个 .md 文件两边都改过必然冲突，
  // 中断后会留下 UU 未合并状态，后续同步全部失败。重置法不存在这个问题。
  const cacheDir = path.join(os.homedir(), '.flowus-sync-cache', repo.replace(/\//g, '__'));
  const br = branch || 'main';
  const g = (cmd, timeoutMs) => sh(`cd /d "${cacheDir}" && ${cmd}`, timeoutMs);

  if (!fs.existsSync(path.join(cacheDir, '.git'))) {
    console.log(`[2/4] git clone ${repo} (depth 1) ...`);
    fs.mkdirSync(path.dirname(cacheDir), { recursive: true });
    retry(3, 'git clone', () =>
      sh(`git clone --depth 1 --branch ${br} "https://github.com/${repo}.git" "${cacheDir}"`, 240000));
  } else {
    console.log(`[2/4] 复用本地缓存（fetch + reset 到远端）...`);
  }

  // 清掉中断遗留的 rebase / merge 状态（失败是正常的，静默忽略）
  const quiet = (cmd) => { try { sh(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }); } catch {} };
  quiet(`cd /d "${cacheDir}" && git rebase --abort`);
  quiet(`cd /d "${cacheDir}" && git merge --abort`);

  if (dryRun) {
    // 试跑模式不联网：直接用缓存当前状态，本地写好文件就好
    console.log(`      --dry-run：跳过 fetch，直接使用本地缓存`);
    return cacheDir;
  }

  retry(3, 'git fetch', () => g(`git fetch --depth 1 origin ${br}`, 120000));
  g('git reset --hard FETCH_HEAD', 60000);
  g('git clean -fdq', 30000);
  console.log(`      已对齐 origin/${br}`);
  return cacheDir;
}

// ---------- 3. 写文件到 flowus/ 子目录 ----------
function writeIntoRepo(repoDir, fileName, markdown, pageId) {
  const flowusDir = path.join(repoDir, 'flowus');
  fs.mkdirSync(flowusDir, { recursive: true });
  const filePath = path.join(flowusDir, fileName);
  // header 不放时间戳：内容没变时不产生无意义的 diff / 空提交
  const header = `<!-- 来源: FlowUs 息流 · page ${pageId} · https://flowus.cn/${pageId} -->\n\n`;
  fs.writeFileSync(filePath, header + markdown, 'utf8');
  return filePath;
}

// ---------- GitHub Contents API 通道（curl 单请求，比 git 抗抖得多） ----------
// 为什么不用 git：你的线路对 git 的 TLS 数据流极不友好（握手成功、传输被卡 1000B/s 以下），
// git fetch/push 动辄 100 秒起步还常失败；而 API 每次只发一个 KB 级 JSON 请求，几秒就能完成。

function githubToken() {
  try {
    const txt = fs.readFileSync(path.join(os.homedir(), '.git-credentials'), 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^https:\/\/([^:\/@]+):([^@]+)@github\.com\/?$/i);
      if (m) return { user: m[1], token: decodeURIComponent(m[2]) };
    }
  } catch {}
  return null;
}

const fwd = (p) => p.replace(/\\/g, '/'); // curl 在 Windows 上也认正斜杠

function curlRequest({ method, url, headers = {}, body = null, timeout = 40 }) {
  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tmpDir = os.tmpdir();
  const cfgPath = path.join(tmpDir, `flowus-sync-${stamp}.curlrc`);
  const outPath = path.join(tmpDir, `flowus-sync-${stamp}.out`);
  const bodyPath = body != null ? path.join(tmpDir, `flowus-sync-${stamp}.json`) : null;
  if (bodyPath) fs.writeFileSync(bodyPath, body, 'utf8');

  const cfg = [
    `url = "${url}"`,
    `request = "${method}"`,
    'silent',
    'show-error',
    `max-time = ${timeout}`,
    `output = "${fwd(outPath)}"`,
    'write-out = "%{http_code}"',
  ];
  if (currentProxy) cfg.push(`proxy = "${currentProxy}"`);
  for (const [k, v] of Object.entries(headers)) cfg.push(`header = "${k}: ${v}"`);
  if (bodyPath) cfg.push(`data-binary = "@${fwd(bodyPath)}"`);
  fs.writeFileSync(cfgPath, cfg.join('\n'), 'utf8');

  let status = '0';
  try {
    const out = execSync(`curl.exe -K "${cfgPath}"`, {
      encoding: 'utf8', timeout: (timeout + 15) * 1000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    status = String(out || '').trim();
  } catch (e) {
    const err = String((e && (e.stderr || e.message)) || e);
    for (const p of [cfgPath, bodyPath]) { try { fs.unlinkSync(p); } catch {} }
    throw new Error(`curl 请求失败: ${err.slice(0, 240)}`);
  }

  const text = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
  for (const p of [cfgPath, bodyPath, outPath]) { try { fs.unlinkSync(p); } catch {} }
  return { status: Number(status), text };
}

function apiHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'flowus-github-sync',
  };
}

// 只写 flowus/<文件名>：先读 sha，内容没变就不提交；有 sha 才是「更新」，不会碰其它文件
function syncViaApi({ repo, branch, fileName, content }) {
  const cred = githubToken();
  if (!cred) throw new Error('~/.git-credentials 里找不到 github.com 的 token');
  const br = branch || 'main';
  const fileUrl = `https://api.github.com/repos/${repo}/contents/flowus/${encodeURIComponent(fileName)}`;
  const h = apiHeaders(cred.token);

  console.log(`[3/4] 读取远端 flowus/${fileName} ...`);
  const got = curlRequest({ method: 'GET', url: `${fileUrl}?ref=${encodeURIComponent(br)}`, headers: h, timeout: 30 });

  let sha = null;
  if (got.status === 200) {
    const json = JSON.parse(got.text);
    sha = json.sha;
    const remote = Buffer.from(String(json.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
    if (remote === content) {
      console.log(`[4/4] 内容与仓库一致，无需提交`);
      return { file: fileName, pushed: false, reason: 'no-change' };
    }
  } else if (got.status !== 404) {
    throw new Error(`读取远端失败 HTTP ${got.status}: ${got.text.slice(0, 200)}`);
  }

  console.log(`[4/4] 提交 flowus/${fileName} ...`);
  const payload = JSON.stringify({
    message: `sync: FlowUs 页 → flowus/${fileName}`,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch: br,
    ...(sha ? { sha } : {}),
  });
  const put = curlRequest({ method: 'PUT', url: fileUrl, headers: h, body: payload, timeout: 60 });
  if (put.status === 200 || put.status === 201) return { file: fileName, pushed: true };
  if (put.status === 409) throw new Error(`409 冲突（远端同名文件刚被改过）: ${put.text.slice(0, 160)}`);
  throw new Error(`提交失败 HTTP ${put.status}: ${put.text.slice(0, 200)}`);
}

// ---------- 单次同步流程 ----------
function runSync(pageId, repo, branch, dryRun, transport) {
  const { title, markdown } = exportFlowusMarkdown(pageId);
  const fileName = safeFilename(title) + '.md';
  const br = branch || 'main';
  // header 不放时间戳：内容没变时不产生无意义的 diff / 空提交
  const header = `<!-- 来源: FlowUs 息流 · page ${pageId} · https://flowus.cn/${pageId} -->\n\n`;
  const content = header + markdown;

  if (dryRun) {
    const repoDir = prepareRepo(repo, branch, true);
    console.log(`[3/4] 写入 flowus/${fileName}`);
    writeIntoRepo(repoDir, fileName, markdown, pageId);
    console.log(`[4/4] --dry-run 模式，跳过提交`);
    return { file: fileName, pushed: false, reason: 'dry-run' };
  }

  // 默认走 API（网络稳），只有显式 --transport git 或拿不到 token 时才用 git
  const cred = githubToken();
  if (transport !== 'git' && cred) {
    return retry(4, 'GitHub API', () => syncViaApi({ repo, branch, fileName, content }));
  }
  if (transport !== 'git') console.log('      ⚠️ 没读到 GitHub token，退回 git 通道');

  const repoDir = prepareRepo(repo, branch, false);
  const g = (cmd, t) => sh(`cd /d "${repoDir}" && ${cmd}`, t);

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[3/4] 写入 flowus/${fileName}${attempt > 1 ? `（第 ${attempt} 次尝试）` : ''}`);
    writeIntoRepo(repoDir, fileName, markdown, pageId);

    g('git add flowus/', 30000);
    const status = g('git status --porcelain flowus/', 30000);
    if (!status) {
      console.log(`[4/4] 内容与仓库一致，无需提交`);
      return { file: fileName, pushed: false, reason: 'no-change' };
    }

    g(`git commit -m "sync: FlowUs 页 → flowus/${fileName} (${new Date().toISOString()})"`, 30000);
    console.log(`[4/4] git push origin ${br} ...`);
    try {
      retry(2, 'git push', () => g(`git push origin HEAD:${br}`, 240000));
      console.log(`      已推送到 origin/${br}`);
      return { file: fileName, pushed: true };
    } catch (e) {
      // 远端被别人抢先更新 / 网络抖动 → 对齐远端后重新覆盖写入再推
      lastErr = e;
      console.log(`      push 失败（第 ${attempt} 次），对齐远端后重试…`);
      retry(2, 'git fetch', () => g(`git fetch --depth 1 origin ${br}`, 240000));
      g('git reset --hard FETCH_HEAD', 60000);
      g('git clean -fdq', 30000);
    }
  }
  throw new Error(`push 连续 3 次被拒: ${String(lastErr && lastErr.message).slice(0, 300)}`);
}

// ---------- 从「完整 URL / 裸 id」里抽出 pageId ----------
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
function normalizePageId(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  const m = s.match(UUID_RE);
  return m ? m[0].toLowerCase() : '';
}

// ---------- 同步一次；网络类失败时重新探测代理再试一次 ----------
async function syncWithProxyRetry(pageId, opts, repoOverride) {
  const repo = isValidRepo(repoOverride) ? String(repoOverride).trim() : opts.repo;
  try {
    return runSync(pageId, repo, opts.branch, false, opts.transport);
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (!NET_ERR_RE.test(msg) || opts._proxyRetried) throw e;
    opts._proxyRetried = true;
    console.log('[proxy] 同步因网络问题失败，重新探测代理后重试一次…');
    await setupProxy({ ...opts, repo, proxy: undefined, forceProbe: true });
    return runSync(pageId, repo, opts.branch, false, opts.transport);
  }
}

// ---------- 本地控制面板 HTML（http://127.0.0.1:7357/） ----------
function renderPanel(cfg, prefill) {
  const repos = cfg.repos || [];
  const def = cfg.defaultRepo || repos[0] || '';
  const chosen = cfg.lastRepo && repos.includes(cfg.lastRepo) ? cfg.lastRepo : def;
  const options = repos
    .map((r) => `<option value="${r.replace(/"/g, '&quot;')}"${r === chosen ? ' selected' : ''}>${r}${r === def ? '（默认）' : ''}</option>`)
    .join('');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>FlowUs → GitHub 同步</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin:0; padding:28px 24px; font:15px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
         background:#f4f2ec; color:#2a2a28; }
  h1 { font-size:19px; margin:0 0 4px; }
  .sub { color:#78746a; font-size:13px; margin-bottom:20px; }
  .card { background:#fff; border:1px solid #e2ded4; border-radius:12px; padding:20px; max-width:760px;
          box-shadow:0 1px 3px rgba(0,0,0,.05); }
  label { display:block; font-size:13px; font-weight:600; margin-bottom:6px; color:#4a4740; }
  input { width:100%; padding:11px 13px; font-size:14px; border:1px solid #d5d0c5; border-radius:8px;
          font-family:inherit; background:#fdfcf9; color:inherit; }
  input:focus { outline:none; border-color:#2d7168; box-shadow:0 0 0 3px rgba(45,113,104,.12); }
  select { padding:11px 13px; font-size:14px; border:1px solid #d5d0c5; border-radius:8px;
           font-family:inherit; background:#fdfcf9; color:inherit; max-width:100%; }
  select:focus { outline:none; border-color:#2d7168; box-shadow:0 0 0 3px rgba(45,113,104,.12); }
  .row { display:flex; gap:10px; margin-top:14px; align-items:center; flex-wrap:wrap; }
  button { padding:11px 22px; font-size:14px; font-weight:600; font-family:inherit; cursor:pointer;
           background:#2d7168; color:#fff; border:none; border-radius:8px; }
  button:hover:not(:disabled) { background:#245c55; }
  button:disabled { opacity:.55; cursor:default; }
  .pill { font-size:12px; padding:3px 10px; border-radius:999px; background:#e9e5db; color:#5a564d; }
  .pill.ok { background:#dff0e2; color:#1f6b38; }
  .pill.bad { background:#fbe2dc; color:#8d2f21; }
  #repohint:empty { display:none; }
  #log { margin-top:18px; font:12.5px/1.65 Consolas,ui-monospace,monospace; white-space:pre-wrap;
         background:#1f242c; color:#d8dde5; border-radius:10px; padding:14px 16px;
         max-height:280px; overflow:auto; }
  #log:empty { display:none; }
  .hint { font-size:12.5px; color:#8a8578; margin-top:14px; line-height:1.7; }
  code { background:#eeeae0; padding:1px 5px; border-radius:4px; font-size:12px; }
</style></head><body>
<h1>FlowUs → GitHub 同步</h1>
<div class="sub">推送到所选仓库的 <code>flowus/</code> 子目录，不动仓库其它文件</div>

<div class="card">
  <label for="repo">保存到哪个仓库</label>
  <div class="row" style="margin-top:0">
    <select id="repo">${options}</select>
    <button id="mkdef" style="padding:9px 14px;font-size:13px;background:#5a7d78">设为默认</button>
    <span class="pill" id="repohint"></span>
  </div>
  <div class="row" style="margin-top:10px">
    <input id="newrepo" placeholder="添加仓库：owner/name" style="flex:1;min-width:200px">
    <button id="addrepo" style="padding:9px 14px;font-size:13px;background:#5a7d78">添加</button>
  </div>

  <label for="url" style="margin-top:18px">粘贴 FlowUs 页面链接（或直接填页面 ID）</label>
  <input id="url" placeholder="https://flowus.cn/6f615c3a-c078-4be8-9458-049555947b59" value="${prefill.replace(/"/g, '&quot;')}">
  <div class="row">
    <button id="go">开始同步</button>
    <span class="pill" id="state">检测服务…</span>
  </div>
  <div id="log"></div>
  <div class="hint">
    · 在 FlowUs 页面按 <b>Ctrl+L</b> 复制地址栏链接，粘到上面即可<br>
    · 一般 2–10 秒完成（走 GitHub API，不跑 git），别关这个窗口<br>
    · 想省事：把下面这行存成浏览器书签，在 FlowUs 页面点一下就自动打开本页面并填好链接<br>
    <code>javascript:void(open('http://127.0.0.1:7357/?page='+encodeURIComponent(location.href)))</code>
  </div>
</div>

<script>
const $url = document.getElementById('url');
const $go = document.getElementById('go');
const $log = document.getElementById('log');
const $state = document.getElementById('state');
const $repo = document.getElementById('repo');
const $newrepo = document.getElementById('newrepo');
const $addrepo = document.getElementById('addrepo');
const $mkdef = document.getElementById('mkdef');
const $repohint = document.getElementById('repohint');

function log(msg) {
  $log.textContent += msg + '\\n';
  $log.scrollTop = $log.scrollHeight;
}

function fillRepos(repos, def) {
  const cur = $repo.value;
  $repo.textContent = '';
  (repos || []).forEach(function (r) {
    const o = document.createElement('option');
    o.value = r;
    o.textContent = r + (r === def ? '（默认）' : '');
    $repo.appendChild(o);
  });
  if (cur && repos && repos.indexOf(cur) >= 0) $repo.value = cur;
}

async function ping() {
  try {
    const r = await fetch('/ping');
    const d = await r.json();
    $state.textContent = '服务在线 · 默认 ' + d.repo;
    $state.className = 'pill ok';
    if ($repo.options.length === 0) fillRepos(d.repos, d.defaultRepo);
    return d;
  } catch {
    $state.textContent = '服务离线';
    $state.className = 'pill bad';
    return null;
  }
}

$addrepo.addEventListener('click', async function () {
  const v = $newrepo.value.trim();
  if (!/^[A-Za-z0-9_.-]+\\/[A-Za-z0-9_.-]+$/.test(v)) { $repohint.textContent = '格式应为 owner/name'; return; }
  try {
    const r = await fetch('/repos?repo=' + encodeURIComponent(v), { method: 'POST' });
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || ('HTTP ' + r.status));
    fillRepos(d.repos, d.defaultRepo);
    $repo.value = v;
    $newrepo.value = '';
    $repohint.textContent = '已添加 ' + v;
  } catch (e) {
    $repohint.textContent = '添加失败：' + String(e.message || e);
  }
});

$mkdef.addEventListener('click', async function () {
  const v = $repo.value;
  if (!v) return;
  try {
    const r = await fetch('/repos?repo=' + encodeURIComponent(v) + '&default=1', { method: 'POST' });
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || ('HTTP ' + r.status));
    fillRepos(d.repos, d.defaultRepo);
    $repo.value = v;
    $repohint.textContent = v + ' 已设为默认';
    ping();
  } catch (e) {
    $repohint.textContent = '设置失败：' + String(e.message || e);
  }
});

async function sync() {
  const raw = $url.value.trim();
  if (!raw) { log('❌ 请先粘贴 FlowUs 页面链接'); return; }
  const m = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!m) { log('❌ 链接里找不到页面 ID（应为 8-4-4-4-12 的 uuid）'); return; }
  const pageId = m[0];
  const repo = $repo.value;

  $go.disabled = true;
  $log.textContent = '';
  log('⏳ 正在同步 ' + pageId + ' → ' + repo + ' …');
  const t0 = Date.now();
  try {
    const resp = await fetch('/sync?pageId=' + encodeURIComponent(pageId) + '&repo=' + encodeURIComponent(repo), { method: 'POST' });
    const data = await resp.json().catch(() => ({}));
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (!resp.ok || data.error) throw new Error(data.error || ('HTTP ' + resp.status));
    log('✅ 完成（' + secs + 's）');
    log('   文件: flowus/' + data.file);
    log('   位置: https://github.com/' + data.repo + '/blob/main/flowus/' + encodeURIComponent(data.file));
  } catch (e) {
    log('❌ 失败（' + ((Date.now() - t0) / 1000).toFixed(1) + 's）');
    log('   ' + String(e.message || e).slice(0, 500));
  } finally {
    $go.disabled = false;
  }
}

$go.addEventListener('click', sync);
$url.addEventListener('keydown', e => { if (e.key === 'Enter') sync(); });
ping();
setInterval(ping, 8000);
if ($url.value) log('已从链接带入页面 ID，点「开始同步」即可。');
</script>
</body></html>`;
}

// ---------- 本地常驻同步服务（给油猴按钮 / 书签调用） ----------
function serve(opts) {
  const http = require('http');
  const PORT = 7357;

  // 允许的页面来源（FlowUs 网页端）
  function corsHeaders(req) {
    const origin = req.headers.origin || '';
    const allow = /^https:\/\/([a-z0-9-]+\.)?flowus\.cn$/i.test(origin) ? origin : '*';
    return {
      'Access-Control-Allow-Origin': allow,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Private-Network': 'true', // Chrome PNA 预检
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
  }

  function send(res, req, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
    res.end(JSON.stringify(obj));
  }

  const server = http.createServer((req, res) => {
    // CORS 预检
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(req));
      res.end();
      return;
    }

    const url = new URL(req.url, 'http://127.0.0.1');

    // 健康检查：油猴/书签可先 ping 判断服务是否在跑
    if (req.method === 'GET' && (url.pathname === '/ping' || url.pathname === '/health')) {
      const rc = getRepoConfig(opts.repo);
      send(res, req, 200, {
        ok: true,
        service: 'flowus-github-sync',
        port: PORT,
        repo: rc.defaultRepo,
        repos: rc.repos,
        defaultRepo: rc.defaultRepo,
        lastRepo: rc.lastRepo,
        busy: serving.active,
      });
      return;
    }

    // 仓库列表维护：加（可选设为默认）/ 删
    if (url.pathname === '/repos' && (req.method === 'POST' || req.method === 'GET')) {
      const repo = url.searchParams.get('repo') || '';
      if (req.method === 'GET') {
        const rc = getRepoConfig(opts.repo);
        send(res, req, 200, { ok: true, ...rc });
        return;
      }
      if (!isValidRepo(repo)) {
        send(res, req, 400, { error: 'repo 格式应为 owner/name' });
        return;
      }
      const setDefault = url.searchParams.get('default') === '1';
      const rc = addRepo(opts.repo, repo, setDefault);
      console.log(`[serve] 添加仓库: ${repo}${setDefault ? '（设为默认）' : ''}`);
      send(res, req, 200, { ok: true, ...rc });
      return;
    }
    if (url.pathname === '/repos/remove' && req.method === 'POST') {
      const repo = url.searchParams.get('repo') || '';
      const rc = removeRepo(opts.repo, repo);
      console.log(`[serve] 移除仓库: ${repo}`);
      send(res, req, 200, { ok: true, ...rc });
      return;
    }

    // 本地控制面板（不需要装任何浏览器扩展的保底方案）
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/panel')) {
      const html = renderPanel(getRepoConfig(opts.repo), url.searchParams.get('page') || '');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (url.pathname !== '/sync') {
      send(res, req, 404, { error: 'POST /sync?pageId=<uuid>  |  GET /ping  |  GET /' });
      return;
    }
    if (req.method !== 'POST') {
      send(res, req, 405, { error: 'method not allowed, use POST' });
      return;
    }

    const pageId = normalizePageId(url.searchParams.get('pageId') || '');
    if (!pageId) {
      send(res, req, 400, { error: 'missing pageId query param' });
      return;
    }
    // 目标仓库：请求里带了就用它（并在成功后记进列表），否则用默认仓库
    const askedRepo = url.searchParams.get('repo');
    if (askedRepo && !isValidRepo(askedRepo)) {
      send(res, req, 400, { error: 'repo 格式应为 owner/name' });
      return;
    }
    const targetRepo = askedRepo ? String(askedRepo).trim() : getRepoConfig(opts.repo).defaultRepo;
    console.log(`[serve] 收到同步请求: ${pageId} → ${targetRepo}`);
    // 简单防并发：同一时刻只跑一个同步
    if (serving.active) {
      send(res, req, 429, { error: 'previous sync in progress, try later' });
      return;
    }
    serving.active = true;
    (async () => {
      try {
        const result = await syncWithProxyRetry(pageId, opts, targetRepo);
        noteRepo(opts.repo, targetRepo);
        send(res, req, 200, {
          ok: true,
          file: result.file,
          pushed: result.pushed,
          reason: result.reason,
          repo: targetRepo,
          pageId,
        });
        console.log(`[serve] 完成: ${targetRepo}/flowus/${result.file}${result.pushed ? ' (已推送)' : ` (${result.reason})`}`);
      } catch (e) {
        send(res, req, 500, { error: String((e && e.message) || e).slice(0, 400), repo: targetRepo, pageId });
        console.error('[serve] 失败:', String((e && e.message) || e).slice(0, 300));
      } finally {
        serving.active = false;
      }
    })();
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n🌐 本地同步服务已启动`);
    console.log(`   👉 控制面板（推荐，无需装扩展）: http://127.0.0.1:${PORT}/`);
    console.log(`   健康检查: http://127.0.0.1:${PORT}/ping`);
    console.log(`   同步接口: POST /sync?pageId=<uuid>`);
    console.log(`   目标仓库: ${opts.repo}\n`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ 端口 ${PORT} 已被占用。请先停止占用进程（Get-NetTCPConnection -LocalPort ${PORT} -State Listen），或换一个端口。`);
      process.exit(1);
    }
    throw err;
  });
}

// ---------- main ----------
const serving = { active: false };
const opts = parseArgs();

(async () => {
  if (opts.serve) {
    await setupProxy(opts);
    serve(opts);
    return;
  }

  if (!opts.pageId) {
    console.error('用法:');
    console.error('  node sync.js <pageId|页面URL> [--dry-run] [--repo <owner/name>] [--branch <branch>]');
    console.error('  node sync.js --serve              # 启动本地常驻服务（扩展按钮 + 控制面板）');
    console.error('可选: --proxy <url> 手动指定代理 | --transport git 改用 git 通道（默认用 GitHub API）');
    console.error('说明: 默认先试直连，不通再自动探测本地代理；--proxy > 环境变量 > 直连 > 上次成功的 > 探测');
    process.exit(1);
  }

  // 允许直接粘整条 FlowUs 链接
  const pageId = normalizePageId(opts.pageId);
  if (!pageId) {
    console.error(`❌ 参数里找不到页面 ID（应为 8-4-4-4-12 的 uuid）: ${opts.pageId}`);
    process.exit(1);
  }

  try {
    // 离线导出模式不需要网络，跳过代理探测
    if (!opts.dryRun) await setupProxy(opts);
    const r = opts.dryRun
      ? runSync(pageId, opts.repo, opts.branch, true, opts.transport)
      : await syncWithProxyRetry(pageId, opts);
    console.log(
      r.pushed
        ? `\n✅ 同步完成并已推送: ${r.file}`
        : `\n✅ 同步完成（未推送，${r.reason}）: ${r.file}`
    );
  } catch (e) {
    console.error('\n❌ 同步失败:', String((e && e.message) || e).slice(0, 600));
    console.error('   若提示网络错误，请确认代理已启动（当前: ' + proxySource + '）');
    process.exit(1);
  }
})();
