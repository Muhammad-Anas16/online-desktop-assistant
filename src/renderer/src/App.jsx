import { useEffect, useRef, useState } from "react";
import { createVoiceSensor } from "./utils/voiceSensor";
import { getAIReply, speechToText } from "./utils/API";
import { playAssistantOutput } from "./utils/audioPlayer";

export default function App() {
  const voiceRef = useRef(null);
  const sessionActiveRef = useRef(false);

  const [status, setStatus] = useState("Idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    voiceRef.current = createVoiceSensor({
      onStatus: setStatus,
      onSpeechStart: () => {
        setError("");
      },
      onSpeechEnd: () => {
        // status is handled by the module
      },
      onError: (err) => {
        console.error(err);
        setError(err?.message || "Voice sensor error");
        setStatus("Error");
      },
      onAudio: async (blob) => {
        try {
          setStatus("Transcribing...");
          const stt = await speechToText(blob);

          if (!stt.success) {
            throw new Error(stt.error || "STT failed");
          }

          const userText = (stt.text || "").trim();
          setTranscript(userText);

          if (!userText) {
            setStatus("No speech detected");
            return;
          }

          setStatus("Thinking...");
          const ai = await getAIReply(userText);

          if (!ai.success) {
            throw new Error(ai.error || "AI reply failed");
          }

          const aiText = (ai.reply || "").trim();
          setReply(aiText);

          setStatus("Playing reply...");
          await playAssistantOutput({ text: aiText });

          if (sessionActiveRef.current) {
            setStatus("Listening...");
            await voiceRef.current.start();
          }
        } catch (err) {
          console.error(err);
          setError(err?.message || "Processing failed");
          setStatus("Error");

          if (sessionActiveRef.current) {
            try {
              await voiceRef.current.start();
            } catch {
              // ignore
            }
          }
        }
      },
    });

    return () => {
      sessionActiveRef.current = false;
      voiceRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const startSession = async () => {
    setError("");
    setTranscript("");
    setReply("");
    sessionActiveRef.current = true;
    setEnabled(true);

    await voiceRef.current?.start();
  };

  return (
    <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1>AI Voice Assistant</h1>

      <button onClick={startSession} disabled={enabled}>
        Enable Voice
      </button>

      <p>
        <strong>Status:</strong> {status}
      </p>
      {error ? <p style={{ color: "red" }}>{error}</p> : null}

      <div style={{ marginTop: 16 }}>
        <h3>Transcript</h3>
        <p>{transcript || "No transcript yet."}</p>
      </div>

      <div style={{ marginTop: 16 }}>
        <h3>AI Reply</h3>
        <p>{reply || "No reply yet."}</p>
      </div>
    </div>
  );
}
