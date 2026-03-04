/**
 * Type declarations for Electron API exposed to renderer process
 * 
 * This file provides TypeScript type definitions for the electronAPI
 * that is exposed through the preload script via contextBridge.
 */

import type { ElectronAPI } from '../preload/index'

declare global {
  interface Window {
    /**
     * Electron API exposed through contextBridge in preload script
     * Provides secure communication channel between renderer and main process
     */
    electronAPI: ElectronAPI
  }
}

export {}
