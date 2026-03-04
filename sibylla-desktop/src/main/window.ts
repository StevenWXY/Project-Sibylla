import { BrowserWindow } from 'electron'
import path from 'path'

const isDev = process.env.NODE_ENV === 'development'
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'

/**
 * Create and configure the main application window
 * @returns {BrowserWindow} The created main window instance
 */
export function createMainWindow(): BrowserWindow {
  // Create browser window with security-focused configuration
  const window = new BrowserWindow({
    // Window dimensions
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    
    // Window properties
    title: 'Sibylla',
    show: false, // Don't show until ready-to-show event
    backgroundColor: '#ffffff',
    
    // Web preferences with security best practices
    webPreferences: {
      // Preload script for secure IPC communication
      preload: path.join(__dirname, '../preload/index.js'),
      
      // Security: Isolate renderer process context
      contextIsolation: true,
      
      // Security: Disable Node.js integration in renderer
      nodeIntegration: false,
      
      // Security: Enable sandbox mode
      sandbox: true,
      
      // Disable web security in development for easier debugging
      webSecurity: !isDev,
    },
    
    // macOS-specific styling
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
  })

  // Show window when ready to prevent visual flash
  window.once('ready-to-show', () => {
    window.show()
    console.log('[Window] Main window is ready and visible')
  })

  // Handle window events
  setupWindowEvents(window)

  // Load content based on environment
  loadWindowContent(window)

  return window
}

/**
 * Setup event handlers for window lifecycle
 * @param {BrowserWindow} window - The window instance to setup events for
 */
function setupWindowEvents(window: BrowserWindow): void {
  // Handle window focus
  window.on('focus', () => {
    console.log('[Window] Window focused')
  })

  // Handle window blur
  window.on('blur', () => {
    console.log('[Window] Window blurred')
  })

  // Handle window maximize
  window.on('maximize', () => {
    console.log('[Window] Window maximized')
  })

  // Handle window unmaximize
  window.on('unmaximize', () => {
    console.log('[Window] Window unmaximized')
  })

  // Handle window minimize
  window.on('minimize', () => {
    console.log('[Window] Window minimized')
  })

  // Handle window restore
  window.on('restore', () => {
    console.log('[Window] Window restored')
  })

  // Handle window close event (before actual close)
  window.on('close', (_event) => {
    console.log('[Window] Window is closing')
    // Future: Add confirmation dialog for unsaved changes
    // if (hasUnsavedChanges) {
    //   _event.preventDefault()
    //   showSaveConfirmationDialog()
    // }
  })
}

/**
 * Load window content based on environment (development or production)
 * @param {BrowserWindow} window - The window instance to load content into
 */
function loadWindowContent(window: BrowserWindow): void {
  if (isDev) {
    // Development: Load from Vite dev server
    window.loadURL(DEV_SERVER_URL).catch((error) => {
      console.error('[Window] Failed to load dev server URL:', error)
    })
    
    // Open DevTools in development mode
    window.webContents.openDevTools()
    console.log('[Window] Loaded development server:', DEV_SERVER_URL)
  } else {
    // Production: Load built HTML file
    const indexPath = path.join(__dirname, '../renderer/index.html')
    window.loadFile(indexPath).catch((error) => {
      console.error('[Window] Failed to load production HTML:', error)
    })
    console.log('[Window] Loaded production build')
  }
}
