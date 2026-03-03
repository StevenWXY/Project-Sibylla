// 全局类型声明
declare global {
  interface Window {
    electronAPI: {
      ping: () => Promise<string>
    }
  }
}

export {}
