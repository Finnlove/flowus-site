// 息流（FlowUs）待办勾选礼花
// 由扩展直接注入，不需要 Tampermonkey / 油猴
// 调试：按住 Alt 再点复选框，控制台会打印被点中的元素链
(function () {
  'use strict';

  if (window.__flowusConfetti) return;
  window.__flowusConfetti = true;

  console.log('%c[礼花] 待办礼花已加载 v2.0（按住 Alt 点复选框可打印命中信息）', 'background:#8B5CF6;color:#fff;padding:2px 6px;border-radius:4px');

  const COLORS = ['#06B6DD', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#3B82F6', '#F97316'];
  const DEBUG = false; // 想排查就改 true，或在页面上按住 Alt 点一次

  // ---------- 判断点的是不是复选框 ----------
  function classOf(el) {
    const c = el.className;
    if (typeof c === 'string') return c;
    if (c && typeof c.baseVal === 'string') return c.baseVal; // SVG 元素
    return el.getAttribute ? (el.getAttribute('class') || '') : '';
  }

  function isCheckboxNode(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' && el.type === 'checkbox') return true;
    const role = el.getAttribute('role');
    if (role === 'checkbox' || role === 'switch') return true;
    const aria = el.getAttribute('aria-checked');
    if (aria === 'true' || aria === 'false') return true;
    if (/checkbox|check-box|todo-?check|task-?check/i.test(classOf(el))) return true;
    return false;
  }

  // 从点击目标往上找 8 层，命中真正的复选框就返回
  // 兜底：按「位置 + 尺寸」认待办复选框
  // 息流的类名是混淆的，且很可能既没 role 也没 aria，只能靠形状判断：
  // 位于某个 block 左侧 48px 内、且是个小方块（<= 30px）
  function looksLikeTodoBox(target) {
    if (!target || target.nodeType !== 1) return null;
    const r = target.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    if (r.width > 30 || r.height > 30) return null;          // 太小/太大都不像复选框
    const ratio = r.width / r.height;
    if (ratio < 0.6 || ratio > 1.7) return null;             // 不是方块
    const block = target.closest('[data-block-id]');
    if (!block) return null;
    const br = block.getBoundingClientRect();
    if (r.left - br.left > 48) return null;                   // 必须在 block 左边距内
    return block;
  }

  function findCheckbox(target) {
    let el = target;
    for (let i = 0; i < 8 && el && el !== document.body; i++, el = el.parentElement) {
      if (isCheckboxNode(el)) return el;
      // 待办块的包裹元素：里面找复选框
      const bt = (el.getAttribute && (el.getAttribute('data-block-type') || el.getAttribute('data-type'))) || '';
      if (/todo|task|to_do/i.test(bt)) {
        const inner = el.querySelector('input[type="checkbox"],[role="checkbox"],[aria-checked],svg');
        if (inner) return inner;
      }
      // svg/path 直接点中也算（很多 UI 用 svg 画复选框）
      const tag = el.tagName.toLowerCase();
      if (tag === 'path' || tag === 'svg') {
        const holder = el.closest('[aria-checked],[role="checkbox"],input[type="checkbox"]');
        if (holder) return holder;
      }
    }
    return looksLikeTodoBox(target);
  }

  // ---------- 礼花 ----------
  function celebrate(x, y) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.style.cssText = `position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;pointer-events:none!important;z-index:2147483647!important;`;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    (document.body || document.documentElement).appendChild(canvas);

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const particles = [];
    const count = 70;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 5 + Math.random() * 12;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        size: 5 + Math.random() * 10,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        alpha: 1,
        rotation: Math.random() * 360,
        spin: (Math.random() - 0.5) * 12,
      });
    }

    let frame = 0;
    (function animate() {
      frame++;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (const p of particles) {
        if (p.alpha <= 0) continue;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2;
        p.vx *= 0.99;
        p.alpha -= 0.01;
        p.rotation += p.spin;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(p.alpha, 0);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }

      if (frame < 100) requestAnimationFrame(animate);
      else canvas.remove();
    })();
  }

  // ---------- 监听点击 ----------
  document.addEventListener('mousedown', function (e) {
    const cb = findCheckbox(e.target);

    if (DEBUG || e.altKey) {
      const chain = [];
      let el = e.target;
      for (let i = 0; i < 8 && el && el !== document.body; i++, el = el.parentElement) {
        chain.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${classOf(el) ? '.' + classOf(el).split(/\s+/).slice(0, 3).join('.') : ''}`);
      }
      const r = e.target.getBoundingClientRect ? e.target.getBoundingClientRect() : {};
      const block = e.target.closest ? e.target.closest('[data-block-id]') : null;
      console.log(
        `[礼花] ${cb ? '✅ 命中' : '❌ 未命中'} | 目标 ${Math.round(r.width || 0)}×${Math.round(r.height || 0)} | ` +
        `block=${block ? block.getAttribute('data-block-id').slice(0, 8) : '无'} | 层级: ${chain.join(' < ')}`
      );
    }

    if (!cb) return;
    celebrate(e.clientX, e.clientY);
  }, true);
})();
