(() => {
  // 智汇排版 · 公众号样式预设（高饱和撞色版）
  // 约束：全内联 style / 根元素 section / 不用 class、pre、position、box-shadow、伪元素、外链图
  // 渐变统一先写 background-color 兜底，再写 linear-gradient
  const esc = (s) =>
    String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  const PRESETS = [
    // ---------- 基础八件套 ----------
    {
      id: 'paragraph',
      label: '正文',
      type: 'wrap',
      build(text) {
        return `<section style="margin:14px 0;font-size:15.5px;line-height:1.9;color:#3A3A3A;letter-spacing:0.4px;text-align:justify;">${esc(text)}</section>`;
      }
    },
    {
      id: 'h1',
      label: '一级标题',
      type: 'wrap',
      build(text) {
        return `<section style="margin:30px 0 18px;">
  <section style="background:#14142B;border-radius:8px 8px 0 0;padding:16px 18px;">
    <span style="font-size:21px;font-weight:bold;color:#FFFFFF;letter-spacing:0.5px;line-height:1.5;">${esc(text)}</span>
  </section>
  <section style="height:6px;background:#FF2E63;background:linear-gradient(90deg,#FF2E63 0%,#FF8A00 55%,#FFD400 100%);border-radius:0 0 8px 8px;"></section>
</section>`;
      }
    },
    {
      id: 'h2',
      label: '二级标题',
      type: 'wrap',
      build(text) {
        return `<section style="margin:26px 0 14px;background:#FFD400;border-left:6px solid #FF2E63;border-radius:0 8px 8px 0;padding:9px 14px;font-size:16.5px;line-height:1.5;">
  <span style="font-size:16.5px;font-weight:bold;color:#14142B;letter-spacing:0.5px;line-height:1.5;">${esc(text)}</span>
</section>`;
      }
    },
    {
      id: 'quote',
      label: '金句',
      type: 'wrap',
      build(text) {
        return `<section style="margin:26px 0;background:#14142B;border-radius:12px;padding:20px 20px 16px;">
  <section style="font-size:42px;line-height:0.8;color:#FF2E63;font-family:Georgia,serif;font-weight:bold;">“</section>
  <section style="margin-top:6px;font-size:17px;line-height:1.85;color:#FFFFFF;font-weight:bold;letter-spacing:0.5px;">${esc(text)}</section>
  <section style="margin-top:14px;">
    <span style="display:inline-block;background:#FFD400;color:#14142B;font-size:11px;font-weight:bold;padding:3px 12px;border-radius:11px;letter-spacing:2px;">金句</span>
  </section>
</section>`;
      }
    },
    {
      id: 'blockquote',
      label: '引用',
      type: 'wrap',
      build(text) {
        return `<section style="margin:20px 0;background:#F3E8FF;border-left:5px solid #7B2FF7;border-radius:0 8px 8px 0;padding:14px 16px;">
  <span style="font-size:14px;line-height:1.85;color:#5B21B6;">${esc(text)}</span>
</section>`;
      }
    },
    {
      id: 'image-caption',
      label: '图片说明',
      type: 'wrap',
      build(text) {
        return `<section style="margin:8px 0 20px;text-align:center;">
  <span style="display:inline-block;font-size:12px;color:#8A8A8A;line-height:1.7;letter-spacing:0.5px;">▲&nbsp;&nbsp;${esc(text)}</span>
</section>`;
      }
    },
    {
      id: 'divider',
      label: '分割线',
      type: 'insert',
      build() {
        return `<section style="margin:28px 0;">
  <section style="height:3px;background:#FF2E63;background:linear-gradient(90deg,#FF2E63 0%,#FF8A00 30%,#FFD400 55%,#00C2A8 80%,#7B2FF7 100%);border-radius:2px;"></section>
</section>`;
      }
    },
    {
      id: 'code-block',
      label: '代码块',
      type: 'wrap',
      build(text) {
        const lines = String(text).split('\n');
        const body = lines
          .map((ln) => {
            const t = ln.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const ind = (t.match(/^ +/) || [''])[0].length;
            const nbsp = new Array(ind * 2 + 1).join('&nbsp;');
            const rest = t.slice(ind).replace(/ /g, '&nbsp;') || '&nbsp;';
            return `<p style="margin:0;font-size:12.5px;line-height:1.75;color:#7BF1A8;font-family:Consolas,Monaco,monospace;white-space:pre-wrap;word-break:break-all;">${nbsp}${rest}</p>`;
          })
          .join('');
        return `<section style="margin:22px 0;background:#14142B;border-radius:10px;padding:14px 16px;font-family:Consolas,Monaco,monospace;">
  <section style="margin:0 0 10px;font-size:10px;color:#00C2A8;letter-spacing:3px;font-weight:bold;">CODE</section>
  ${body}
</section>`;
      }
    },

    // ---------- 彩色增强件 ----------
    {
      id: 'numbered-title',
      label: '编号小标题',
      type: 'wrap',
      build(text) {
        return `<section style="margin:28px 0 12px;">
  <span style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;background:#00C2A8;color:#FFFFFF;font-size:16px;font-weight:bold;border-radius:9px;vertical-align:middle;margin-right:10px;">01</span>
  <span style="font-size:17px;font-weight:bold;color:#14142B;vertical-align:middle;letter-spacing:0.5px;">${esc(text)}</span>
</section>`;
      }
    },
    {
      id: 'color-highlight',
      label: '荧光高亮',
      type: 'wrap',
      build(text) {
        return `<span style="background:#FFD400;font-weight:bold;color:#14142B;padding:0 2px;">${esc(text)}</span>`;
      }
    },
    {
      id: 'info-card',
      label: '要点卡片',
      type: 'wrap',
      build(text) {
        return `<section style="margin:22px 0;background:#FFF5F8;border:1px solid #FFD5E0;border-radius:12px;padding:16px;">
  <section style="margin-bottom:9px;">
    <span style="display:inline-block;background:#FF2E63;color:#FFFFFF;font-size:11px;font-weight:bold;padding:3px 11px;border-radius:11px;letter-spacing:2px;">要点</span>
  </section>
  <section style="font-size:14.5px;line-height:1.9;color:#333333;">${esc(text)}</section>
</section>`;
      }
    },
    {
      id: 'data-block',
      label: '数据强调',
      type: 'wrap',
      build(text) {
        return `<section style="margin:20px 0;text-align:center;">
  <section style="display:inline-block;background:#7B2FF7;background:linear-gradient(135deg,#7B2FF7 0%,#FF2E63 100%);border-radius:14px;padding:16px 30px;">
    <span style="font-size:30px;font-weight:bold;color:#FFFFFF;letter-spacing:1px;line-height:1.2;">${esc(text)}</span>
  </section>
</section>`;
      }
    },
    {
      id: 'decorative-separator',
      label: '彩色分隔符',
      type: 'insert',
      build() {
        return `<section style="margin:30px 0;text-align:center;">
  <span style="color:#FF2E63;font-size:13px;font-weight:bold;letter-spacing:3px;">✦&nbsp;&nbsp;本&nbsp;期&nbsp;看&nbsp;点&nbsp;&nbsp;✦</span>
  <section style="margin-top:9px;height:2px;background:#FFD400;background:linear-gradient(90deg,rgba(255,212,0,0) 0%,#FFD400 50%,rgba(255,212,0,0) 100%);"></section>
</section>`;
      }
    },
    {
      id: 'intro-block',
      label: '引言块',
      type: 'wrap',
      build(text) {
        return `<section style="margin:24px 0;background:#FFFBE6;border:1px dashed #FF8A00;border-radius:10px;padding:16px 18px;">
  <section style="font-size:11px;color:#FF8A00;font-weight:bold;letter-spacing:3px;margin-bottom:7px;">写在前面</section>
  <section style="font-size:14.5px;line-height:1.9;color:#4A3B00;">${esc(text)}</section>
</section>`;
      }
    },
    {
      id: 'key-points',
      label: '要点列表',
      type: 'insert',
      build() {
        const items = [
          ['#FF2E63', '第一点内容，在这里写清楚'],
          ['#FF8A00', '第二点内容，一行为一句'],
          ['#00C2A8', '第三点内容，保持简短有力']
        ];
        const rows = items
          .map(
            (it) => `<section style="margin:9px 0;">
  <span style="display:inline-block;width:9px;height:9px;background:${it[0]};border-radius:50%;margin-right:10px;vertical-align:middle;"></span>
  <span style="font-size:14.5px;line-height:1.8;color:#333333;vertical-align:middle;">${it[1]}</span>
</section>`
          )
          .join('');
        return `<section style="margin:22px 0;">${rows}</section>`;
      }
    },
    {
      id: 'thought-block',
      label: '小结块',
      type: 'wrap',
      build(text) {
        return `<section style="margin:26px 0;background:#14142B;border-radius:10px;">
  <section style="height:5px;background:#00C2A8;background:linear-gradient(90deg,#00C2A8 0%,#FFD400 100%);border-radius:10px 10px 0 0;"></section>
  <section style="padding:16px 18px 18px;">
    <section style="font-size:11px;color:#00C2A8;font-weight:bold;letter-spacing:3px;margin-bottom:8px;">小&nbsp;结</section>
    <section style="font-size:14.5px;line-height:1.9;color:#E8E8F0;">${esc(text)}</section>
  </section>
</section>`;
      }
    }
  ];

  window.PRESETS = PRESETS;
})();
