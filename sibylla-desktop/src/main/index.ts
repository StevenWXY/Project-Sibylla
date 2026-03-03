import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'

// 保持对主窗口的引用，防止被垃圾回收
let mainWindow: BrowserWindow | null = null

// 应用准备就绪
app.whenReady().then(() => {
  mainWindow = createMainWindow()
  
  // 监听窗口关闭事件
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // macOS 特性：点击 Dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

// 所有窗口关闭时退出应用（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
