import { BrowserWindow } from 'electron'
import path from 'path'

const isDev = process.env.NODE_ENV === 'development'
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'Sibylla',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    // macOS 样式
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
  })

  if (isDev) {
    // 开发环境：加载 Vite 开发服务器
    window.loadURL(DEV_SERVER_URL)
    window.webContents.openDevTools()
  } else {
    // 生产环境：加载构建产物
    window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return window
}
