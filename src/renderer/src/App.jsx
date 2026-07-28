import { useEffect, useRef, useState } from 'react'
import { createMicStreamer } from './utils/micStream'
// import 'dotenv/config'

export default function App() {
  const micRef = useRef(null)
  const [status, setStatus] = useState('Idle')
  const [partialText, setPartialText] = useState('')
  const [finalTurns, setFinalTurns] = useState([])
  const [error, setError] = useState('')
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    micRef.current = createMicStreamer({
      onError: (err) => {
        console.error(err)
        setError(err?.message || 'Microphone error')
        setStatus('Error')
      }
    })

    const offTranscript = window.api.onTranscript(({ transcript, endOfTurn }) => {
      if (endOfTurn) {
        if (transcript) {
          setFinalTurns((prev) => [...prev, transcript])
        }
        setPartialText('')
      } else {
        setPartialText(transcript)
      }
    })

    const offStatus = window.api.onStatus((s) => setStatus(s))
    const offError = window.api.onError((msg) => {
      setError(msg)
      setStatus('Error')
    })

    return () => {
      offTranscript?.()
      offStatus?.()
      offError?.()
      micRef.current?.stop()
      window.api.stopTranscription()
    }
  }, [])

  const startSession = async () => {
    setError('')
    setFinalTurns([])
    setPartialText('')
    setEnabled(true)
    window.api.startTranscription()
    await micRef.current?.start()
  }

  const stopSession = () => {
    setEnabled(false)
    micRef.current?.stop()
    window.api.stopTranscription()
    setStatus('Idle')
  }

  return (
    <div style={{ padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <h1>AI Voice Assistant (AssemblyAI Streaming)</h1>

      <button onClick={startSession} disabled={enabled}>
        Enable Voice
      </button>
      <button onClick={stopSession} disabled={!enabled} style={{ marginLeft: 8 }}>
        Stop
      </button>

      <p>
        <strong>Status:</strong> {status}
      </p>
      {error ? <p style={{ color: 'red' }}>{error}</p> : null}

      <div style={{ marginTop: 16 }}>
        <h3>Transcript</h3>
        <p style={{ whiteSpace: 'pre-wrap' }}>
          {finalTurns.join(' ')}
          {partialText ? <span style={{ color: '#999' }}> {partialText}</span> : null}
        </p>
      </div>
    </div>
  )
}
