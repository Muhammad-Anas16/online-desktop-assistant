export function createMicStreamer({ onError = () => {} } = {}) {
  let audioContext = null
  let stream = null
  let source = null
  let processor = null
  let running = false

  const downsampleTo16k = (float32Array, inputSampleRate) => {
    if (inputSampleRate === 16000) {
      return float32Array
    }
    const ratio = inputSampleRate / 16000
    const newLength = Math.round(float32Array.length / ratio)
    const result = new Float32Array(newLength)
    for (let i = 0; i < newLength; i += 1) {
      result[i] = float32Array[Math.floor(i * ratio)]
    }
    return result
  }

  const floatTo16BitPCM = (float32Array) => {
    const buffer = new ArrayBuffer(float32Array.length * 2)
    const view = new DataView(buffer)
    let offset = 0
    for (let i = 0; i < float32Array.length; i += 1, offset += 2) {
      const s = Math.max(-1, Math.min(1, float32Array[i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    }
    return buffer
  }

  const start = async () => {
    if (running) return
    running = true

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      })

      const AudioCtx = window.AudioContext || window.webkitAudioContext
      audioContext = new AudioCtx()
      await audioContext.resume()

      source = audioContext.createMediaStreamSource(stream)
      processor = audioContext.createScriptProcessor(4096, 1, 1)

      processor.onaudioprocess = (event) => {
        if (!running) return
        const inputData = event.inputBuffer.getChannelData(0)
        const downsampled = downsampleTo16k(inputData, audioContext.sampleRate)
        const pcm16 = floatTo16BitPCM(downsampled)
        window.api.sendAudioChunk(pcm16)
      }

      source.connect(processor)
      processor.connect(audioContext.destination)
    } catch (err) {
      running = false
      onError(err)
    }
  }

  const stop = () => {
    running = false
    try {
      processor?.disconnect()
      source?.disconnect()
    } catch {
      // ignore
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      stream = null
    }
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close()
    }
    audioContext = null
  }

  const isRunning = () => running

  return { start, stop, isRunning }
}
