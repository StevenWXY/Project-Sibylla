import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { WorkspaceInfo } from '../../shared/types'

/**
 * Theme type definition
 */
export type Theme = 'light' | 'dark' | 'system'

/**
 * File information
 */
export interface FileInfo {
  path: string
  name: string
  lastModified: number
}

/**
 * Application state interface
 */
interface AppState {
  // ========== Theme ==========
  theme: Theme
  setTheme: (theme: Theme) => void
  
  // ========== Sidebar ==========
  sidebarCollapsed: boolean
  sidebarWidth: number
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setSidebarWidth: (width: number) => void
  
  // ========== Workspace ==========
  currentWorkspace: WorkspaceInfo | null
  recentWorkspaces: WorkspaceInfo[]
  setCurrentWorkspace: (workspace: WorkspaceInfo | null) => void
  addRecentWorkspace: (workspace: WorkspaceInfo) => void
  removeRecentWorkspace: (id: string) => void
  clearRecentWorkspaces: () => void
  
  // ========== File ==========
  currentFile: FileInfo | null
  openFiles: FileInfo[]
  setCurrentFile: (file: FileInfo | null) => void
  addOpenFile: (file: FileInfo) => void
  removeOpenFile: (path: string) => void
  clearOpenFiles: () => void
  
  // ========== Loading State ==========
  isLoading: boolean
  loadingMessage: string | null
  setIsLoading: (loading: boolean, message?: string) => void
  
  // ========== Error State ==========
  error: string | null
  errorDetails: Record<string, unknown> | null
  setError: (error: string | null, details?: Record<string, unknown>) => void
  clearError: () => void
  
  // ========== UI State ==========
  showCommandPalette: boolean
  showSettings: boolean
  setShowCommandPalette: (show: boolean) => void
  setShowSettings: (show: boolean) => void
  toggleCommandPalette: () => void
  toggleSettings: () => void
  
  // ========== Reset ==========
  reset: () => void
}

/**
 * Initial state
 */
const initialState = {
  theme: 'system' as Theme,
  sidebarCollapsed: false,
  sidebarWidth: 256,
  currentWorkspace: null,
  recentWorkspaces: [],
  currentFile: null,
  openFiles: [],
  isLoading: false,
  loadingMessage: null,
  error: null,
  errorDetails: null,
  showCommandPalette: false,
  showSettings: false,
}

/**
 * Application store with Zustand
 *
 * Features:
 * - DevTools integration for debugging
 * - Persist middleware for localStorage
 * - Type-safe actions and state
 * - Organized by feature domains
 */
export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,
        
        // ========== Theme Actions ==========
        setTheme: (theme) => set({ theme }, false, 'setTheme'),
        
        // ========== Sidebar Actions ==========
        toggleSidebar: () => set(
          (state) => ({ sidebarCollapsed: !state.sidebarCollapsed }),
          false,
          'toggleSidebar'
        ),
        
        setSidebarCollapsed: (collapsed) => set(
          { sidebarCollapsed: collapsed },
          false,
          'setSidebarCollapsed'
        ),
        
        setSidebarWidth: (width) => set(
          { sidebarWidth: Math.max(200, Math.min(400, width)) },
          false,
          'setSidebarWidth'
        ),
        
        // ========== Workspace Actions ==========
        /**
         * Set current workspace and automatically update recent workspaces list
         *
         * This is the primary method for switching workspaces. It automatically
         * adds the workspace to the recent list with updated timestamp.
         *
         * @param workspace - Workspace to set as current, or null to clear
         */
        setCurrentWorkspace: (workspace) => {
          set({ currentWorkspace: workspace }, false, 'setCurrentWorkspace')
          
          // Update recent workspaces as a side effect
          if (workspace) {
            get().addRecentWorkspace(workspace)
          }
        },
        
        /**
         * Manually add a workspace to recent list without setting it as current
         *
         * Use this when you need to update the recent list independently,
         * e.g., when loading workspace history from storage.
         *
         * @param workspace - Workspace to add to recent list
         */
        addRecentWorkspace: (workspace) => set(
          (state) => {
            const filtered = state.recentWorkspaces.filter(w => w.config.workspaceId !== workspace.config.workspaceId)
            const updated = [workspace, ...filtered].slice(0, 10) // Keep max 10
            return { recentWorkspaces: updated }
          },
          false,
          'addRecentWorkspace'
        ),
        
        removeRecentWorkspace: (id) => set(
          (state) => ({
            recentWorkspaces: state.recentWorkspaces.filter(w => w.config.workspaceId !== id)
          }),
          false,
          'removeRecentWorkspace'
        ),
        
        clearRecentWorkspaces: () => set(
          { recentWorkspaces: [] },
          false,
          'clearRecentWorkspaces'
        ),
        
        // ========== File Actions ==========
        setCurrentFile: (file) => set(
          (state) => {
            const updates: Partial<AppState> = { currentFile: file }
            
            // Add to open files if not null and not already open (atomic operation)
            if (file && !state.openFiles.some(f => f.path === file.path)) {
              updates.openFiles = [...state.openFiles, file]
            }
            
            return updates
          },
          false,
          'setCurrentFile'
        ),
        
        addOpenFile: (file) => set(
          (state) => {
            if (state.openFiles.some(f => f.path === file.path)) {
              return state
            }
            return { openFiles: [...state.openFiles, file] }
          },
          false,
          'addOpenFile'
        ),
        
        removeOpenFile: (path) => set(
          (state) => ({
            openFiles: state.openFiles.filter(f => f.path !== path),
            currentFile: state.currentFile?.path === path ? null : state.currentFile
          }),
          false,
          'removeOpenFile'
        ),
        
        clearOpenFiles: () => set(
          { openFiles: [], currentFile: null },
          false,
          'clearOpenFiles'
        ),
        
        // ========== Loading Actions ==========
        setIsLoading: (loading, message) => set(
          { isLoading: loading, loadingMessage: message || null },
          false,
          'setIsLoading'
        ),
        
        // ========== Error Actions ==========
        setError: (error, details) => set(
          { error, errorDetails: details || null },
          false,
          'setError'
        ),
        
        clearError: () => set(
          { error: null, errorDetails: null },
          false,
          'clearError'
        ),
        
        // ========== UI Actions ==========
        setShowCommandPalette: (show) => set(
          { showCommandPalette: show },
          false,
          'setShowCommandPalette'
        ),
        
        setShowSettings: (show) => set(
          { showSettings: show },
          false,
          'setShowSettings'
        ),
        
        toggleCommandPalette: () => set(
          (state) => ({ showCommandPalette: !state.showCommandPalette }),
          false,
          'toggleCommandPalette'
        ),
        
        toggleSettings: () => set(
          (state) => ({ showSettings: !state.showSettings }),
          false,
          'toggleSettings'
        ),
        
        // ========== Reset ==========
        reset: () => set(initialState, false, 'reset'),
      }),
      {
        name: 'sibylla-app-storage',
        version: 1,
        partialize: (state) => ({
          theme: state.theme,
          sidebarCollapsed: state.sidebarCollapsed,
          sidebarWidth: state.sidebarWidth,
          recentWorkspaces: state.recentWorkspaces,
        }),
      }
    ),
    { name: 'AppStore' }
  )
)

/**
 * Selectors for optimized re-renders
 */
export const selectTheme = (state: AppState) => state.theme
export const selectSidebarCollapsed = (state: AppState) => state.sidebarCollapsed
export const selectCurrentWorkspace = (state: AppState) => state.currentWorkspace
export const selectCurrentFile = (state: AppState) => state.currentFile
export const selectIsLoading = (state: AppState) => state.isLoading
export const selectError = (state: AppState) => state.error
export const selectOpenFiles = (state: AppState) => state.openFiles
export const selectRecentWorkspaces = (state: AppState) => state.recentWorkspaces
