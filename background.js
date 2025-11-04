/* Minimal background service worker for logging lifecycle */
chrome.runtime.onInstalled.addListener(() => {
  console.log('[IconScout AutoTag] Extension installed.');
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[IconScout AutoTag] Extension started.');
});