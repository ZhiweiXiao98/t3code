(() => {
  const {app, BrowserWindow, crashReporter} = require('electron');
  const fs = require('node:fs');
  if (app.isReady() || BrowserWindow.getAllWindows().length !== 0)
    throw new Error('Diagnostic startup was not early');
  if (crashReporter.getUploadToServer())
    throw new Error('Unexpected pre-existing upload setting');
  const directory = `/tmp/t3-local-crash-${process.pid}`;
  fs.mkdirSync(directory, {mode: 0o700});
  app.setPath('crashDumps', directory);
  crashReporter.start({uploadToServer: false, ignoreSystemCrashHandler: false,
    extra: {}, globalExtra: {}});
  if (crashReporter.getUploadToServer() !== false)
    throw new Error('Local-only crash capture unavailable');
  return {localOnly: true, beforeReady: true, windowCount: 0};
})()
