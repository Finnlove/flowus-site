#!/usr/bin/env python3
"""FlowUs 息流 → GitHub Pages 静态站生成器
拉取指定根页面的 markdown，生成 Notion 风格静态站。
用法: python build_site.py   (需要 FLOWUS_TOKEN 环境变量)
"""
import json
import os
import re
import shutil
import sys
import urllib.request

# ========== 配置 ==========
ROOT_PAGE_ID = "22ee5bf2-490f-42c7-9853-b16568c0a674"  # 三下数学
BASE_URL = "https://api.flowus.cn"
OUT_DIR = "docs"
TOKEN = os.environ.get("FLOWUS_TOKEN", "")

LINK_RE = re.compile(r"\[([^\]]+)\]\((https://flowus\.cn/([0-9a-f-]+))\)")

PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<link rel="stylesheet" href="{css_path}">
</head>
<body>
<nav><a class="home" href="{home_path}">← 返回首页</a></nav>
<article id="content"></article>
<script src="{marked_path}"></script>
<script>
const md = {md_json};
document.getElementById('content').innerHTML = marked.parse(md);
</script>
</body>
</html>
"""

CSS = """/* Notion 风格 */
:root { --text: #37352f; --muted: #787774; --bg: #ffffff; --code-bg: #f7f6f3; --border: #e9e9e7; }
* { box-sizing: border-box; }
body { margin: 0; background: linear-gradient(120deg, #f3ecd9, #cfdfcb, #c3d7e8, #c2ddd5, #d3d9e4); background-size: 140% 140%; animation: soft-flow 15s ease-in-out infinite; color: var(--text); font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.7; }
nav { max-width: 760px; margin: 0 auto; padding: 24px 20px 0; }
nav a { color: var(--muted); text-decoration: none; font-size: 14px; }
nav a:hover { color: var(--text); }
article { max-width: 760px; margin: 0 auto; padding: 24px 20px 80px; background: rgba(255, 255, 255, 0.88); border-radius: 12px; font-size: 16px; }
h1, h2, h3, h4 { font-weight: 600; line-height: 1.3; letter-spacing: -0.01em; margin-top: 1.4em; }
h1 { font-size: 1.9em; margin-top: 0.5em; }
h2 { font-size: 1.4em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); }
a { color: #1976d2; text-decoration: none; }
a:hover { text-decoration: underline; }
code { background: var(--code-bg); border-radius: 4px; padding: 0.15em 0.4em; font-family: "SF Mono", Consolas, monospace; font-size: 0.88em; }
pre { background: var(--code-bg); border-radius: 8px; padding: 16px; overflow-x: auto; }
pre code { background: none; padding: 0; }
blockquote { margin: 1em 0; padding-left: 1em; border-left: 3px solid var(--border); color: var(--muted); }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
th { background: var(--code-bg); font-weight: 600; }
img { max-width: 100%; border-radius: 4px; }
hr { border: none; border-top: 1px solid var(--border); margin: 2em 0; }
ul, ol { padding-left: 1.5em; }
li { margin: 0.25em 0; }
/* 首页导航卡片 */
.card { display: block; padding: 14px 16px; border: 1px solid var(--border); border-radius: 8px; margin: 8px 0; color: var(--text); transition: background 0.15s; }
.card:hover { background: var(--code-bg); text-decoration: none; }
.card .date { color: var(--muted); font-size: 13px; float: right; }
.empty { color: var(--muted); font-style: italic; }
/* 柔和流动渐变背景 */
@keyframes soft-flow {
  0% { background-position: 0% 30%; }
  50% { background-position: 100% 70%; }
  100% { background-position: 0% 30%; }
}
@media (prefers-reduced-motion: reduce) {
  body { animation: none; }
}
"""


def fetch_markdown(page_id: str) -> str:
    """拉取页面 markdown。返回 (markdown, last_edited)"""
    url = f"{BASE_URL}/v2/pages/{page_id}/content/markdown"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode("utf-8"))
    return data.get("markdown", ""), data.get("last_edited_time", "")


def rewrite_links(md: str, page_ids: set) -> str:
    """把站内 flowus.cn/{id} 链接改写成相对链接 pages/{id}.html"""
    def repl(m):
        title, url, pid = m.group(1), m.group(2), m.group(3)
        if pid in page_ids:
            return f"[{title}](pages/{pid}.html)"
        return m.group(0)
    return LINK_RE.sub(repl, md)


def slugify(title: str) -> str:
    # 标题可能重复或含特殊字符，slug 用 id 保证唯一；这里仅用于显示
    return title.strip()


def build():
    if not TOKEN:
        print("错误: 请设置 FLOWUS_TOKEN 环境变量")
        sys.exit(1)

    print(f"拉取根页面 {ROOT_PAGE_ID} ...")
    root_md, root_time = fetch_markdown(ROOT_PAGE_ID)
    print(f"根页面 markdown: {len(root_md)} 字符, 更新于 {root_time}")

    # 解析子页面链接
    children = []
    seen = set()
    for m in LINK_RE.finditer(root_md):
        title, pid = m.group(1), m.group(3)
        if pid not in seen:
            seen.add(pid)
            children.append((title, pid))
    print(f"发现 {len(children)} 个子页面")

    # 拉取每个子页面
    pages = {}  # pid -> (title, markdown, edited)
    for title, pid in children:
        try:
            md, edited = fetch_markdown(pid)
            pages[pid] = (title, md, edited)
            status = f"{len(md)} 字符" if md.strip() else "空页面"
            print(f"  [{title}] {status}")
        except Exception as e:
            print(f"  [{title}] 拉取失败: {e}")

    # 生成输出
    os.makedirs(f"{OUT_DIR}/pages", exist_ok=True)
    os.makedirs(f"{OUT_DIR}/assets", exist_ok=True)
    shutil.copy("assets/marked.min.js", f"{OUT_DIR}/assets/marked.min.js")

    all_ids = set(pages.keys())

    # 首页
    cards = []
    for title, pid in children:
        if pid not in pages:
            continue
        md, edited = pages[pid][1], pages[pid][2]
        has_content = bool(md.strip())
        date = edited[:10] if edited else ""
        hint = "" if has_content else ' <span class="empty">（整理中）</span>'
        cards.append(
            f'<a class="card" href="pages/{pid}.html">{title}{hint}'
            f'<span class="date">{date}</span></a>'
        )
    index = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>数学专题</title>
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<nav><a class="home" href="index.html">🏠 数学专题</a></nav>
<article>
<h1>数学专题</h1>
<p>三下数学 · 由息流内容自动生成</p>
{''.join(cards)}
</article>
</body>
</html>"""
    with open(f"{OUT_DIR}/index.html", "w", encoding="utf-8") as f:
        f.write(index)

    # 每个专题页
    for pid, (title, md, edited) in pages.items():
        page_md = rewrite_links(md, all_ids)
        html = PAGE_TEMPLATE.format(
            title=title,
            css_path="../assets/style.css",
            home_path="../index.html",
            marked_path="../assets/marked.min.js",
            md_json=json.dumps(page_md, ensure_ascii=False),
        )
        with open(f"{OUT_DIR}/pages/{pid}.html", "w", encoding="utf-8") as f:
            f.write(html)

    with open(f"{OUT_DIR}/assets/style.css", "w", encoding="utf-8") as f:
        f.write(CSS)

    print(f"\n完成: {OUT_DIR}/ 已生成 {len(pages)} 个页面 + 首页")


if __name__ == "__main__":
    build()
