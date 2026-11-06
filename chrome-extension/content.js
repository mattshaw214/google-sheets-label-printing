(() => {
  if (window.top !== window) {
    return;
  }
  import(chrome.runtime.getURL('lib/content-bridge.js'))
    .then(({ installContentBridge }) => installContentBridge())
    .catch(() => {});
})();

