# 安装：让 FlowUs 页面上出现「同步到 GitHub」按钮

一共 5 步，**只需做一次**，之后永久有效。

---

## 第 1 步：确认本地服务在运行

服务已经设置了**开机自启**，现在也在运行中。验证方法：浏览器打开

### http://127.0.0.1:7357/ping

看到 `{"ok":true,...}` 就说明正常。

> 如果打不开：双击 `%USERPROFILE%\.flowus-github-sync\start-service.cmd`
> 想关掉自启：删除 `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\flowus-github-sync.vbs`

---

## 第 2 步：打开扩展管理页

**在你平时打开 FlowUs 的那个浏览器里**，地址栏输入（回车）：

| 浏览器 | 地址 |
|---|---|
| Chrome | `chrome://extensions` |
| Edge | `edge://extensions` |

⚠️ 你机器上有两个 Chrome：默认安装的 + `E:\360Downloads\...` 的便携版。**哪个开 FlowUs 就装哪个**。

---

## 第 3 步：打开「开发者模式」

页面**右上角**的「开发者模式 / Developer mode」开关，打开。

---

## 第 4 步：点「加载已解压的扩展程序」

页面左上角出现的按钮：「加载已解压的扩展程序 / Load unpacked」。

在弹出的选文件夹对话框里，**地址栏直接粘这条路径**再回车：

```
%USERPROFILE%\.flowus-github-sync\extension
```

然后点「选择文件夹」。

装好后列表里会出现 **FlowUs → GitHub 同步**。

---

## 第 5 步：刷新 FlowUs 页面

`Ctrl + R` 刷新任意 FlowUs 页面。

**右上角会出现绿色按钮「● 同步到 GitHub ▾」**：

- 🟢 左边的圆点是绿的 → 服务正常，点一下就能展开面板
- 🔴 红点 → 本地服务没起来，双击 `start-service.cmd`
- 按钮可以**拖动**，挡住内容就拖走

点一下 → 展开**仓库面板** → 点想存的那个仓库（排最前的是上次用过的）→ 显示「⏳ 正在同步」→ 10–60 秒后显示「✅ 已保存到 xxx」+ 文件名。

面板里还能：

- **＋ 添加仓库**：填 `owner/name` 回车，以后就在列表里了
- **控制面板 ↗**：打开网页版面板（可以在那里设默认仓库）

> 顺带：直接点浏览器工具栏的扩展图标 = 用**默认仓库**同步当前页（弹个 ✓ 徽标，不弹面板）。

---

## 装完还是看不到按钮？先看这两条

**① 按 F12 打开 Console，看有没有这行：**

```
[FlowUs→GitHub] 按钮已注入 v1.2.0  当前页ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

- **有这行** → 扩展在跑，按钮存在但可能被挤到别处：看 Console 里有没有报错。
- **没这行** → 扩展没生效。回 `chrome://extensions` 检查：
  - 卡片上的开关是不是蓝色/开启状态
  - 有没有红色「错误」按钮，点开看报什么错

**② 确认地址栏域名**：必须是 `https://flowus.cn/...` 或 `https://xxx.flowus.cn/...`。
如果你用的是别的域名（比如公司自建），把该域名加进 `extension\manifest.json` 的 `matches` 数组，再到 `chrome://extensions` 点该扩展的「重新加载」。

---

## 备选方案（不想装扩展时）

**A. 控制面板**：<http://127.0.0.1:7357/> —— 粘链接、选仓库、点同步，功能完全一样，就是每次要开这个页面。

**B. 油猴脚本**：如果你以后装了 Tampermonkey，可以把
`%USERPROFILE%\.flowus-github-sync\flowus-sync-button.user.js` 拖进浏览器窗口直接安装。
注意：**油猴版没有仓库选择面板**，只会同步到默认仓库；要选仓库请用上面的扩展或控制面板。

> 你当前浏览器里**没有装 Tampermonkey**，所以那个 `.user.js` 一直没有生效——不是脚本写错了，是缺运行环境。

---

## 目录说明

```
%USERPROFILE%\.flowus-github-sync\
  extension\                    ← 浏览器扩展（第 4 步选的就是这个文件夹）
    manifest.json
    background.js               负责访问 127.0.0.1:7357（绕开网页跨域限制）
    content.js                  负责在 FlowUs 页面画按钮 + 仓库选择面板
  sync.js                      同步核心（导出 FlowUs → 写文件 → 推 GitHub）+ 本地服务
  config.json（自动生成在 ~）    仓库列表 / 默认仓库 / 上次使用的仓库
  start-service.cmd            启动本地服务
  stop-service.cmd             停止本地服务
  flowus-sync-button.user.js   油猴版（备选，只能用默认仓库）
  README.md                    完整文档与故障排查
  INSTALL.md                   本文件
```
