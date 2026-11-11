/* 智汇排版 · background.js
 * 只做一件事：点击工具栏图标时，通知当前标签页切换面板显隐。
 */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'ZHP_TOGGLE' });
  } catch (e) {
    // 当前页没有注入 content script（不是公众号后台），忽略
  }
});
