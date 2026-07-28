import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  startTranscription: () => ipcRenderer.send('start-transcription'),
  stopTranscription: () => ipcRenderer.send('stop-transcription'),
  sendAudioChunk: (arrayBuffer) => ipcRenderer.send('audio-chunk', arrayBuffer),

  onTranscript: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('transcript-turn', listener)
    return () => ipcRenderer.removeListener('transcript-turn', listener)
  },
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('transcription-status', listener)
    return () => ipcRenderer.removeListener('transcription-status', listener)
  },
  onError: (callback) => {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('transcription-error', listener)
    return () => ipcRenderer.removeListener('transcription-error', listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
