"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import styles from "./VoiceNoteRecorder.module.css";

const MAX_DURATION_MS = 30_000;
const BAR_COUNT = 5;

interface VoiceNoteRecorderProps {
  onVoiceNote: (blob: Blob | null) => void;
  disabled?: boolean;
}

export function VoiceNoteRecorder({ onVoiceNote, disabled }: VoiceNoteRecorderProps) {
  const [recState, setRecState] = useState<"idle" | "recording" | "recorded">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  // Array of amplitude levels (0–1) for each bar
  const [amplitudeLevels, setAmplitudeLevels] = useState<number[]>(Array(BAR_COUNT).fill(0));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Cancel animation frame and close audio context on stop / unmount
  const stopAmplitudeAnimation = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAmplitudeLevels(Array(BAR_COUNT).fill(0));
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    stopAmplitudeAnimation();
    setLiveAnnouncement("Recording stopped");
  }, [stopAmplitudeAnimation]);

  const startAmplitudeAnimation = useCallback((stream: MediaStream) => {
    try {
      const audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArray);

        // Compute RMS amplitude (0–1)
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const norm = (dataArray[i] - 128) / 128;
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);

        // Distribute slightly different heights per bar for a natural look
        setAmplitudeLevels(
          Array.from({ length: BAR_COUNT }, (_, i) => {
            const offset = ((i - Math.floor(BAR_COUNT / 2)) * 0.1);
            return Math.min(1, Math.max(0.05, rms * 4 + offset));
          })
        );

        animFrameRef.current = requestAnimationFrame(tick);
      };

      animFrameRef.current = requestAnimationFrame(tick);
    } catch {
      // Web Audio API unavailable — amplitude visualization is optional, silently skip
    }
  }, []);

  const startRecording = useCallback(async () => {
    setPermissionError(false);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setPermissionError(true);
      return;
    }

    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setRecState("recorded");
      onVoiceNote(blob);
      stream.getTracks().forEach((t) => t.stop());
    };

    recorder.start(100);
    setRecState("recording");
    setElapsed(0);
    setLiveAnnouncement("Recording started");

    timerRef.current = setInterval(() => {
      setElapsed((s) => s + 1);
    }, 1000);

    autoStopRef.current = setTimeout(stopRecording, MAX_DURATION_MS);

    startAmplitudeAnimation(stream);
  }, [onVoiceNote, stopRecording, startAmplitudeAnimation]);

  const discard = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setElapsed(0);
    setRecState("idle");
    setLiveAnnouncement("");
    onVoiceNote(null);
  }, [audioUrl, onVoiceNote]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAmplitudeAnimation();
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
    };
  }, [stopAmplitudeAnimation]);

  const remaining = 30 - elapsed;

  // Graceful degradation: MediaRecorder not available
  const mediaRecorderSupported =
    typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";

  if (!mediaRecorderSupported) {
    return (
      <div className={styles.wrapper}>
        <span className={styles.label}>Voice Note (optional, max 30s)</span>
        <p className={styles.unsupported}>
          Voice recording is not supported in this browser.
        </p>
      </div>
    );
  }

  const ariaLabel =
    recState === "idle"
      ? "Start recording voice note"
      : recState === "recording"
      ? "Stop recording"
      : "Discard voice note recording";

  return (
    <div className={styles.wrapper}>
      {/* Visually hidden ARIA live region for screen reader announcements */}
      <div
        aria-live="assertive"
        aria-atomic="true"
        className={styles.srOnly}
      >
        {liveAnnouncement}
      </div>

      <span className={styles.label}>Voice Note (optional, max 30s)</span>

      {permissionError && (
        <p className={styles.error} role="alert">
          Microphone access denied. Please allow microphone permissions to record.
        </p>
      )}

      {recState === "idle" && (
        <button
          type="button"
          className={styles.recordBtn}
          onClick={startRecording}
          disabled={disabled}
          aria-label={ariaLabel}
        >
          Record
        </button>
      )}

      {recState === "recording" && (
        <div className={styles.recording}>
          <span className={styles.dot} aria-hidden="true" />

          {/* Amplitude bars */}
          <div className={styles.amplitudeBars} aria-hidden="true">
            {amplitudeLevels.map((level, i) => (
              <span
                key={i}
                className={styles.amplitudeBar}
                style={{ "--bar-scale": level } as React.CSSProperties}
              />
            ))}
          </div>

          <span className={styles.time} aria-live="polite">{remaining}s remaining</span>
          <button
            type="button"
            className={styles.stopBtn}
            onClick={stopRecording}
            aria-label={ariaLabel}
          >
            Stop
          </button>
        </div>
      )}

      {recState === "recorded" && audioUrl && (
        <div className={styles.playback}>
          <audio src={audioUrl} controls className={styles.player} aria-label="Voice note preview" />
          <button
            type="button"
            className={styles.discardBtn}
            onClick={discard}
            aria-label={ariaLabel}
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
