// Stand-ins for other apps (a paint program and a browser), run as their
// own process, so Drawing Practice sees them as someone else's windows.
const { app, BrowserWindow, ipcMain } = require('electron')

// Chromium stops painting windows that are covered; a real paint program
// keeps its canvas current, so these stand-ins must too.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

app.whenReady().then(async () => {
  const mk = (title, html, x, top) => {
    const w = new BrowserWindow({ x, y: 120, width: 600, height: 400, title, show: true, alwaysOnTop: !!top, webPreferences: { backgroundThrottling: false } })
    w.loadURL(`data:text/html,<title>${title}</title>${encodeURIComponent(html)}`)
    return w
  }
  mk('Sketch.clip - Fake Paint Studio', '<body style="margin:0;background:red"><div style="position:fixed;left:40%;top:40%;width:20%;height:20%;background:black"></div></body>', 150)
  await new Promise((r) => setTimeout(r, 500))
  mk('Reference page - Fake Browser', '<body style="margin:0;background:blue"></body>', 150, true)
  void ipcMain
})
