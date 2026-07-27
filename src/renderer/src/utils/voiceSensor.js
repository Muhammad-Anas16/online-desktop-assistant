export function createVoiceSensor({
  onStatus = () => {},
  onSpeechStart = () => {},
  onSpeechEnd = () => {},
  onAudio = () => {},
  onError = () => {},
  threshold = 0.03,
  activationMs = 180,
  silenceMs = 900,
  sampleEveryMs = 50,
  minSpeechMs = 250,
  streamConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  },
} = {}) {
  let stream = null;
  let audioContext = null;
  let analyser = null;
  let mediaRecorder = null;

  let monitorInterval = null;
  let silenceTimer = null;
  let voiceHoldTimer = null;

  let running = false;
  let speechDetected = false;
  let lastVoiceAboveAt = 0;
  let startedAt = 0;

  let chunks = [];

  const cleanupTimers = () => {
    if (monitorInterval) clearInterval(monitorInterval);
    if (silenceTimer) clearTimeout(silenceTimer);
    if (voiceHoldTimer) clearTimeout(voiceHoldTimer);

    monitorInterval = null;
    silenceTimer = null;
    voiceHoldTimer = null;
  };

  const stopTracks = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  };

  const closeAudioContext = async () => {
    try {
      if (audioContext && audioContext.state !== "closed") {
        await audioContext.close();
      }
    } catch {
      // ignore
    }
    audioContext = null;
    analyser = null;
  };

  const stopRecorderAndGetBlob = async () => {
    const recorder = mediaRecorder;

    if (!recorder || recorder.state === "inactive") {
      return null;
    }

    const mimeType = recorder.mimeType || "audio/webm";

    const blob = await new Promise((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mimeType }));
      };

      try {
        recorder.stop();
      } catch {
        resolve(new Blob(chunks, { type: mimeType }));
      }
    });

    return blob;
  };

  const finaliseSpeech = async () => {
    if (!running) return;

    const elapsed = Date.now() - startedAt;

    cleanupTimers();
    running = false;

    try {
      const blob = await stopRecorderAndGetBlob();
      chunks = [];

      if (blob && blob.size > 0 && elapsed >= minSpeechMs) {
        await Promise.resolve(onAudio(blob));
        onSpeechEnd(blob);
      } else {
        onSpeechEnd(null);
      }
    } catch (err) {
      onError(err);
    } finally {
      await closeAudioContext();
      stopTracks();
    }
  };

  const startSilenceCountdown = () => {
    if (silenceTimer) clearTimeout(silenceTimer);

    silenceTimer = setTimeout(() => {
      finaliseSpeech();
    }, silenceMs);
  };

  const startRecorderIfNeeded = () => {
    if (mediaRecorder && mediaRecorder.state === "inactive") {
      try {
        mediaRecorder.start();
      } catch (err) {
        onError(err);
      }
    }
  };

  const startSpeech = () => {
    if (speechDetected || !running) return;

    speechDetected = true;
    startedAt = Date.now();

    onSpeechStart();
    onStatus("Speaking...");
    startRecorderIfNeeded();
    startSilenceCountdown();
  };

  const monitorVolume = () => {
    if (!running || !analyser) return;

    const buffer = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buffer);

    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const value = (buffer[i] - 128) / 128;
      sum += value * value;
    }

    const rms = Math.sqrt(sum / buffer.length);
    const aboveThreshold = rms >= threshold;

    if (aboveThreshold) {
      lastVoiceAboveAt = Date.now();

      if (!speechDetected && !voiceHoldTimer) {
        voiceHoldTimer = setTimeout(() => {
          voiceHoldTimer = null;

          if (!running || speechDetected) return;

          const stillRecentlyAbove =
            Date.now() - lastVoiceAboveAt < activationMs + 30;
          if (stillRecentlyAbove) {
            startSpeech();
          }
        }, activationMs);
      }

      if (speechDetected) {
        startSilenceCountdown();
      }
    } else {
      if (!speechDetected && voiceHoldTimer) {
        clearTimeout(voiceHoldTimer);
        voiceHoldTimer = null;
      }
    }
  };

  const start = async () => {
    if (running) return;

    running = true;
    speechDetected = false;
    lastVoiceAboveAt = 0;
    startedAt = 0;
    chunks = [];

    try {
      onStatus("Requesting microphone...");

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone API not supported in this environment.");
      }

      stream = await navigator.mediaDevices.getUserMedia(streamConstraints);

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        throw new Error("AudioContext not supported.");
      }

      audioContext = new AudioCtx();
      await audioContext.resume();

      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;

      source.connect(analyser);

      if (typeof MediaRecorder === "undefined") {
        throw new Error("MediaRecorder not supported.");
      }

      mediaRecorder = new MediaRecorder(
        stream,
        MediaRecorder.isTypeSupported("audio/webm")
          ? { mimeType: "audio/webm" }
          : undefined,
      );

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      onStatus("Listening...");

      monitorInterval = setInterval(monitorVolume, sampleEveryMs);
    } catch (err) {
      running = false;
      onError(err);
      cleanupTimers();
      await closeAudioContext();
      stopTracks();
    }
  };

  const stop = async () => {
    running = false;
    speechDetected = false;

    cleanupTimers();

    try {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
    } catch {
      // ignore
    }

    chunks = [];
    await closeAudioContext();
    stopTracks();
    onStatus("Stopped");
  };

  const isRunning = () => running;

  return {
    start,
    stop,
    isRunning,
  };
}
