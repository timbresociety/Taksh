"use client";

import { useEffect, useRef, useState } from "react";
import { ogHeaders } from "@/lib/og/session";

const MAX_MS = 15000; // the route refuses anything much longer

// Tap to talk, tap again to stop. The recording goes to /api/transcribe (0G, private tier) and
// the words land in the idea box, where they can be read and fixed before making the game.
export default function MicButton({ onText, onError, disabled }) {
  const [state, setState] = useState("idle"); // idle | recording | hearing
  const recorder = useRef(null);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));
    return () => recorder.current?.state === "recording" && recorder.current.stop();
  }, []);

  if (!supported) return null;

  async function start() {
    onError(null);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError("The microphone is blocked. Allow it, or type your idea.");
      return;
    }
    const chunks = [];
    const rec = new MediaRecorder(stream);
    recorder.current = rec;
    const timer = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_MS);
    rec.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    rec.onstop = async () => {
      clearTimeout(timer);
      stream.getTracks().forEach((track) => track.stop());
      const audio = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      setState("hearing");
      try {
        const response = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": audio.type, ...ogHeaders() }, body: audio });
        const reply = await response.json();
        if (!response.ok) throw new Error(reply.error);
        onText(reply.text);
      } catch (failure) {
        onError(failure.message || "0G could not hear that. Try again, or type it.");
      } finally {
        setState("idle");
      }
    };
    rec.start();
    setState("recording");
  }

  const label = { idle: "Say it", recording: "Stop", hearing: "Listening…" }[state];
  return (
    <button
      type="button"
      className={`button button--mic${state === "recording" ? " is-recording" : ""}`}
      aria-pressed={state === "recording"}
      disabled={disabled || state === "hearing"}
      onClick={() => (state === "recording" ? recorder.current.stop() : start())}
    >
      {label}
    </button>
  );
}
