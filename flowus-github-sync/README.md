# FlowUs → GitHub 同步

把 FlowUs 息流的**当前页**同步到**你选的 GitHub 仓库**的 `flowus/` 子目录，按页标题命名 `.md`，**不动仓库其它文件**。

> **想在 FlowUs 页面上直接点按钮同步？** → 看 [INSTALL.md](INSTALL.md)（5 步装好浏览器扩展，永久有效）

## 在新电脑上装（从 GitHub 下载）

本插件也放在 <https://github.com/Finnlove/flowus-site> 的 `flowus-github-sync/` 目录里，换机器时按这 6 步：

```powershell
# 1) 装 Node.js（LTS）  https://nodejs.org/
node -v

# 2) 把插件目录拷到固定位置
git clone https://github.com/Finnlove/flowus-site "$env:TEMP\flowus-site"
robocopy "$env:TEMP\flowus-site\flowus-github-sync" "$env:USERPROFILE\.flowus-github-sync" /E
#    没装 git 也行：网页右上 Code → Download ZIP，解压后把 flowus-github-sync 文件夹改名为 .flowus-github-sync 放用户目录

# 3) 装 FlowUs CLI 并登录（要能读页面）
irm 'https://cdn2.flowus.cn/flowus-cli/install.ps1' | iex
[Environment]::SetEnvironmentVariable('FLOWUS_CONFIG_DIR', "$env:USERPROFILE\.flowus", 'User')
flowus login --browser      # 浏览器里点授权，完成后 flowus --json doctor 应显示 authenticated: true

# 4) 准备 GitHub token（右键新建 PAT，勾 contents: write 即可）
#    把下面这行写进 %USERPROFILE%\.git-credentials（换成你自己的 token）
#    https://<你的GitHub用户名>:ghp_xxxxxxxxxxxxxxxxxxxx@github.com

# 5) 起服务（以后每次开机双击一次，或按下面「开机自启」配一次）
& "$env:USERPROFILE\.flowus-github-sync\start-service.cmd"
```

6. 浏览器 `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选 `%USERPROFILE%\.flowus-github-sync\extension` → 刷新 FlowUs 页面

### 开机自启（可选，配一次就够）

```powershell
$vbs = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\flowus-github-sync.vbs"
$node = (Get-Command node).Source
$sync = "$env:USERPROFILE\.flowus-github-sync\sync.js"
@"
Set sh = CreateObject("WScript.Shell")
sh.Run """$node"" ""$sync"" --serve", 0, False
"@ | Set-Content -LiteralPath $vbs -Encoding ASCII
```

## 安装位置

```
%USERPROFILE%\.flowus-github-sync\   ← 固定安装目录（不受编辑器/worktree 清理影响）
  extension\                         浏览器扩展（按钮 + 仓库选择面板，见 INSTALL.md）
  sync.js                            同步核心 + 本地服务
  config.json                        仓库列表 / 默认仓库（第一次加仓库时自动生成）
  start-service.cmd / stop-service.cmd 启停本地服务
  flowus-sync-button.user.js         油猴版（备选，只能用默认仓库）
  INSTALL.md                         扩展安装步骤
  README.md                          本文件
```

本机（`C:\Users\123`）的服务已设**开机自启**（`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\flowus-github-sync.vbs`），正常情况下你不用管它。

---

## 方式一：控制面板（免装扩展的备用方案）

**1. 确认服务在跑**：浏览器打开 <http://127.0.0.1:7357/ping> 应显示 `{"ok":true,...}`；没有就双击 `start-service.cmd`。

**2. 打开控制面板**：浏览器访问 <http://127.0.0.1:7357/>


**3. 选仓库 + 同步**：面板顶部下拉框选「保存到哪个仓库」（可点「设为默认」，也可在下面输入 `owner/name` 添加新仓库）→ 在 FlowUs 页面按 `Ctrl+L` 复制地址栏链接 → 粘进输入框 → 点「开始同步」。

10–30 秒后日志显示 `✅ 完成`，文件落在**所选仓库**的 `flowus/<页标题>.md`。

### 懒人书签（可选）

把下面这行存成浏览器书签，在 FlowUs 页面点一下，会自动打开控制面板并填好当前页链接：

```js
javascript:void(open('http://127.0.0.1:7357/?page='+encodeURIComponent(location.href)))
```

> 少数站点 CSP 会拦 `javascript:` 书签，拦了就手输链接，一样能用。

---

## 方式二：网页右上角按钮（浏览器扩展，推荐）

> 装法见 [INSTALL.md](INSTALL.md)（5 步，只需一次）。

### 用法

点按钮 → **展开面板列出所有仓库** → 点其中一行就把当前页同步到那个仓库。

```
● 同步到 GitHub ▾
┌─────────────────────────────┐
│ 保存到哪个仓库               │
│ 页 6f615c3a-…                │
│ ┌─────────────────────────┐ │
│ │ Finnlove/workbook       │ │ ← 上次用过的排最前
│ │ 上次 · 默认       同步 › │ │
│ ├─────────────────────────┤ │
│ │ Finnlove/notes-archive  │ │
│ │ 默认 / 上次使用   同步 › │ │
│ └─────────────────────────┘ │
│ ＋ 添加仓库        控制面板 ↗│
└─────────────────────────────┘
```

- **排最前的就是上次用过的仓库**，再点一下就走它，不用每次重新选
- **＋ 添加仓库**：输入 `owner/name` 回车，立刻进列表（写进 `~/.flowus-github-sync/config.json`，重启服务不丢）
- 面板底部「控制面板 ↗」= 打开网页版面板（可设默认仓库）
- 点面板外面 / 再点按钮 = 收起

### 按钮状态灯

| 灯色 | 含义 |
|---|---|
| 🟢 绿 | 本地服务在线，可以直接点 |
| 🟡 黄 | 正在同步 |
| ⚪ 灰 | 还没探测到服务（等服务起来会自动变绿） |
| 🔴 红 | 本地服务没运行 —— 先双击 `start-service.cmd` |

按钮可以**拖动**，如果它压住 FlowUs 自己的工具栏，拖到别处即可。

### 按钮不出现？按顺序排查

| 检查项 | 怎么做 |
|---|---|
| 扩展装了吗 | 浏览器地址栏右侧有没有扩展图标（`chrome://extensions` 里能看到「FlowUs 工具栏」） |
| 扩展启用了吗 | 扩展卡片上的开关必须是开（蓝色） |
| 允许在无痕/受限页面跑 | 扩展详情里打开「允许访问文件网址」「在无痕模式下运行」 |
| 扩展真的在跑吗 | FlowUs 页面按 `F12` → Console，应看到绿色 `[FlowUs→GitHub] 按钮已注入 v1.2.0` |
| 匹配到当前域名了吗 | `extension\manifest.json` 的 `matches` 应包含当前 flowus 域名 |
| 页面顶栏遮住了 | 拖动把按钮挪出来；或直接用**方式一**控制面板 |

> **不想折腾扩展就跳方式一**，功能完全一样（一样能选仓库）。

---

## 命令行手动同步

```powershell
# 同步（pageId 从 FlowUs 页面 URL 里取，也可以直接传整条 URL）
node "$env:USERPROFILE\.flowus-github-sync\sync.js" 6f615c3a-c078-4be8-9458-049555947b59
node "$env:USERPROFILE\.flowus-github-sync\sync.js" "https://flowus.cn/6f615c3a-c078-4be8-9458-049555947b59"

# 只导出不推送（完全离线可用，不访问 GitHub）
node "$env:USERPROFILE\.flowus-github-sync\sync.js" <pageId> --dry-run

# GitHub 网络不通时：不用管，脚本会自动探测本地代理
# 也可以手动指定（只影响访问 GitHub 的请求，FlowUs CLI 始终直连）
node "$env:USERPROFILE\.flowus-github-sync\sync.js" <pageId> --proxy socks5h://127.0.0.1:4080

# 指定其它仓库 / 分支
node "$env:USERPROFILE\.flowus-github-sync\sync.js" <pageId> --repo owner/name --branch dev

# 极少数情况要用老通道（git 浅克隆 + commit + push）
node "$env:USERPROFILE\.flowus-github-sync\sync.js" <pageId> --transport git
```

`--serve` 启动本地服务（端口 `127.0.0.1:7357`，只监听本机），同样支持 `--proxy` / `--transport`：

```powershell
node "$env:USERPROFILE\.flowus-github-sync\sync.js" --serve --proxy socks5h://127.0.0.1:4080
```

### 网络：为什么默认不走 git

你的线路对 git 的 TLS 数据流很不友好（握手成功、传输被卡在 1000B/s 以下），`git fetch/push` 动辄 100 秒起步还常失败。
所以默认改成 **GitHub Contents API 单请求写入**（每次 KB 级 JSON，实测 1~4 秒完成），git 通道只作兜底。

代理判断顺序：`--proxy` → 环境变量 → **先试直连 api.github.com** → 上次成功的代理 → 扫本地端口（4080/7890/1080…）逐个验证。
直连能用就绝不用代理，避免被不稳定的免费节点拖累。

---

## 同步行为

| 动作 | 说明 |
|---|---|
| 导出 | `flowus markdown get <pageId>` 导出当前页 markdown |
| 目标仓库 | 面板里选哪个就写哪个；默认 `Finnlove/workbook`，可在面板里加仓库 / 设默认（存在 `~/.flowus-github-sync/config.json`） |
| 文件名 | 页标题做安全化（去 Windows 非法字符），如 `2026年个人工作台.md` |
| 路径 | 所选仓库根目录下的 `flowus/<标题>.md` |
| 写入方式 | 默认 GitHub Contents API：先读该文件 sha → 内容不同才 PUT 覆盖；**只碰这一个文件** |
| 不动其它 | `.github` / `scripts` / `workbench` / `README.md` 完全不受影响 |
| 幂等 | 页面内容没变时**不产生提交**（返回 `pushed:false, reason:no-change`） |
| 并发 | 服务端同一时刻只跑一个同步，重复点击返回 `429` |
| 网络 | 先直连 api.github.com，不通再自动探测本地代理；每次请求失败自动重试 4 次 |
| 凭据 | 复用 `~/.git-credentials` 里的 github.com token + FlowUs OAuth 存储凭据，不打印任何密钥 |

### 本地服务接口（自己写脚本也能调）

| 接口 | 作用 |
|---|---|
| `GET /ping` | 健康检查 + 返回 `repos` / `defaultRepo` / `lastRepo` |
| `POST /sync?pageId=<uuid>&repo=owner/name` | 同步到指定仓库（`repo` 省略则用默认仓库） |
| `POST /repos?repo=owner/name[&default=1]` | 加仓库进列表，`default=1` 同时设为默认 |
| `POST /repos/remove?repo=owner/name` | 从列表移除 |

---

## 故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| `EADDRINUSE 7357` | 端口被上次的进程占着 | `Get-CimInstance Win32_Process -Filter "Name='node.exe'" \| ? { $_.CommandLine -match 'sync\.js' } \| % { Stop-Process -Id $_.ProcessId -Force }` |
| 按钮点了报「连不上本地服务」 | 服务没起 | 先跑 `start-service.cmd`；浏览器开 <http://127.0.0.1:7357/ping> 应显示 `{"ok":true}` |
| `git clone 失败: unable to access` | 用了 `--transport git` 且走了死代理 | 先 `Remove-Item Env:HTTP_PROXY, Env:HTTPS_PROXY`；仍不行加 `--proxy socks5h://127.0.0.1:4080` |
| `curl 请求失败: curl: (7)` | 代理端口没开 / 端口错 | 确认代理软件在跑：`netstat -ano \| Select-String ":4080.*LISTENING"` |
| `HTTP 401` | `~/.git-credentials` 里的 token 失效 | 重新生成 token 并更新该文件 |
| `HTTP 409` | 同名文件刚被别人改过 | 再点一次即可（会重新读 sha） |
| 按钮/面板提示「连不上本地服务」 | 服务没起 | 先跑 `start-service.cmd`；<http://127.0.0.1:7357/ping> 应显示 `{"ok":true}` |
| `Page not found` | pageId 不对 | 确认是页面 URL 里 `8-4-4-4-12` 格式的 uuid |
| `❌ 同步失败` + git 输出 | 凭据或网络 | `git ls-remote https://github.com/Finnlove/workbook` 手动验证一次 |
| 缓存的仓库状态乱了 | 中断留下脏状态 | 删掉 `%USERPROFILE%\.flowus-sync-cache` 整个目录，下次会自动重新 clone |
| FlowUs 凭据过期 | OAuth refresh 失效 | `flowus login --browser` 重新授权 |

---

## 安全说明

- 只读 FlowUs（`markdown get`），只写仓库的 `flowus/` 子目录
- 不存储、不打印 GitHub token（复用系统已有的 git 凭据）
- 本地服务只监听 `127.0.0.1:7357`，不对局域网/公网开放
- CORS 只对 `*.flowus.cn` 回显 Origin，其它来源落到 `*`（只读 `/ping` 无害，写操作仍需本机发起）
