import { contextBridge, ipcRenderer } from 'electron'

// 定义暴露给渲染进程的 API 接口
interface ElectronAPI {
  // 测试用的 ping 方法
  ping: () => Promise<string>
}

// 通过 contextBridge 暴露安全的 API
const api: ElectronAPI = {
  ping: async () => {
    try {
      return await ipcRenderer.invoke('test:ping')
    } catch (error) {
      console.error('IPC call failed:', error)
      throw error
    }
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

// 类型声明
export type { ElectronAPI }
