import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import WebSocket from 'ws'
import icon from '../../resources/icon.png?asset'

// Apni API key yahan daalo (ya process.env se load karo, .env + dotenv use kar k)
const ASSEMBLYAI_API_KEY = '78c09708725b4920b95fd8a6efc7d96d'

let aaiSocket = null

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function startAssemblyStream(senderWebContents) {
  if (aaiSocket) return

  const params = new URLSearchParams({
    sample_rate: '16000',
    encoding: 'pcm_s16le',
    format_turns: 'true'
  })

  aaiSocket = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?${params}`, {
    headers: { Authorization: ASSEMBLYAI_API_KEY }
  })

  aaiSocket.on('open', () => {
    senderWebContents.send('transcription-status', 'Listening...')
  })

  aaiSocket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString())

      if (msg.type === 'Turn') {
        senderWebContents.send('transcript-turn', {
          transcript: msg.transcript,
          endOfTurn: msg.end_of_turn
        })
      } else if (msg.type === 'Begin') {
        senderWebContents.send('transcription-status', 'Session started')
      } else if (msg.type === 'Termination') {
        senderWebContents.send('transcription-status', 'Session ended')
      }
    } catch (err) {
      console.error('Parse error:', err)
    }
  })

  aaiSocket.on('error', (err) => {
    console.error('AssemblyAI WS error:', err)
    senderWebContents.send('transcription-error', err.message)
  })

  aaiSocket.on('close', () => {
    aaiSocket = null
    senderWebContents.send('transcription-status', 'Stopped')
  })
}

function stopAssemblyStream() {
  if (aaiSocket && aaiSocket.readyState === WebSocket.OPEN) {
    aaiSocket.send(JSON.stringify({ type: 'Terminate' }))
  }
  aaiSocket = null
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.on('start-transcription', (event) => {
    startAssemblyStream(event.sender)
  })

  ipcMain.on('audio-chunk', (_event, arrayBuffer) => {
    if (aaiSocket && aaiSocket.readyState === WebSocket.OPEN) {
      aaiSocket.send(Buffer.from(arrayBuffer))
    }
  })

  ipcMain.on('stop-transcription', () => {
    stopAssemblyStream()
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopAssemblyStream()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})
