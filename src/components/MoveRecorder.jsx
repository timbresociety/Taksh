"use client";

import { useEffect, useRef, useState } from "react";
import { PoseFeed } from "@/lib/motion/feed";
import { LM } from "@/lib/motion/landmarks";
import { drawSkeleton } from "@/lib/motion/overlay";

// Records a webcam clip of the moves the games use, with cues on screen, so the clip can stand in
// for a camera in headless runs (scripts/camera-play.mjs). It opens on a still stand for calibration.
const ROUTINE = [
  { until: 6, cue: "Stand still", detail: "Arms at your sides" },
  { until: 16, cue: "Slash", detail: "Swipe a hand across your body, left then right" },
  { until: 22, cue: "Guard, then duck", detail: "Fists to your chin, hold, then squat" },
  { until: 28, cue: "Jump and step", detail: "Jump, then step left and right" },
  { until: 38, cue: "Row", detail: "Lift both arms and pump them down hard" },
  { until: 46, cue: "Reach up", detail: "Left hand high, right hand high, then both" },
  { until: 54, cue: "Box", detail: "Jab left and right, then hooks" },
  { until: 60, cue: "Run on the spot", detail: "Quick feet, high knees" },
];
const LENGTH_S = ROUTINE.at(-1).until;
const COUNTDOWN_S = 3;
const IN_VIEW = [LM.nose, LM.leftAnkle, LM.rightAnkle, LM.leftWrist, LM.rightWrist];

function recordingType() {
  return ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
}

export default function MoveRecorder() {
  const video = useRef(null);
  const overlay = useRef(null);
  const feed = useRef(null);
  const recorder = useRef(null);
  const [error, setError] = useState(null);
  const [framed, setFramed] = useState(false);
  const [phase, setPhase] = useState("setup"); // setup, countdown, recording, done
  const [clock, setClock] = useState(0);
  const [clip, setClip] = useState(null);

  useEffect(() => {
    const pose = new PoseFeed();
    feed.current = pose;
    let unsubscribe = () => {};
    let alive = true;
    // A feed torn down while it was still starting has to stop again once it has a stream to stop.
    pose.start(video.current).then(() => {
      if (!alive) return pose.stop();
      unsubscribe = pose.subscribe(({ points, aspect }) => {
        drawSkeleton(overlay.current, points, aspect);
        setFramed(Boolean(points) && IN_VIEW.every((index) => points[index].v > 0.55));
      });
    }).catch((cause) => {
      pose.stop();
      if (alive) setError(cause.message);
    });
    return () => {
      alive = false;
      unsubscribe();
      pose.stop();
    };
  }, []);

  useEffect(() => {
    if (phase !== "countdown" && phase !== "recording") return;
    const started = performance.now();
    const timer = setInterval(() => setClock((performance.now() - started) / 1000), 100);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === "countdown" && clock >= COUNTDOWN_S) {
      const type = recordingType();
      const chunks = [];
      const media = new MediaRecorder(feed.current.stream, { mimeType: type, videoBitsPerSecond: 8e6 });
      media.ondataavailable = (event) => chunks.push(event.data);
      media.onstop = () => {
        const blob = new Blob(chunks, { type });
        setClip({ url: URL.createObjectURL(blob), name: `taksh-moves.${type.startsWith("video/mp4") ? "mp4" : "webm"}` });
        setPhase("done");
      };
      media.start(1000);
      recorder.current = media;
      setClock(0);
      setPhase("recording");
    }
    if (phase === "recording" && clock >= LENGTH_S) recorder.current?.state === "recording" && recorder.current.stop();
  }, [phase, clock]);

  const step = ROUTINE.find((item) => clock < item.until) ?? ROUTINE.at(-1);
  const next = ROUTINE[ROUTINE.indexOf(step) + 1];
  const start = () => {
    setClip(null);
    setClock(0);
    setPhase("countdown");
  };

  return (
    <main style={{ position: "fixed", inset: 0, background: "#05060f", color: "#fff", fontFamily: "var(--font-body)" }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <video ref={video} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
        <canvas ref={overlay} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      </div>

      <div style={{ position: "absolute", left: 24, top: 24, display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ padding: "6px 14px", borderRadius: 999, fontWeight: 700, background: framed ? "#21c48d" : "#ff4f6d" }}>
          {framed ? "Head to feet in view" : "Step back until your head, hands and feet are in view"}
        </span>
        {phase === "recording" && <span style={{ padding: "6px 14px", borderRadius: 999, fontWeight: 700, background: "#e00" }}>● REC {Math.floor(clock)}s / {LENGTH_S}s</span>}
      </div>

      {error && <p style={{ position: "absolute", top: 80, left: 24, background: "#ff4f6d", padding: 12, borderRadius: 8 }}>Camera failed: {error}</p>}

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 32, textAlign: "center", textShadow: "0 2px 12px #000" }}>
        {phase === "setup" && (
          <button type="button" className="button button--go" onClick={start} style={{ fontSize: "1.4rem" }}>Start recording ({LENGTH_S}s)</button>
        )}
        {phase === "countdown" && <div style={{ fontFamily: "var(--font-display)", fontSize: "9rem", fontWeight: 900 }}>{Math.max(1, Math.ceil(COUNTDOWN_S - clock))}</div>}
        {phase === "recording" && (
          <>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "5rem", fontWeight: 900, lineHeight: 1 }}>{step.cue}</div>
            <div style={{ fontSize: "1.6rem", marginTop: 8 }}>{step.detail} · {Math.ceil(step.until - clock)}s</div>
            {next && <div style={{ fontSize: "1.1rem", marginTop: 8, opacity: 0.75 }}>Next: {next.cue}</div>}
            <div style={{ margin: "16px auto 0", width: "60%", height: 8, background: "#fff3", borderRadius: 4 }}>
              <div style={{ width: `${(clock / LENGTH_S) * 100}%`, height: "100%", background: "#e9ff3a", borderRadius: 4 }} />
            </div>
          </>
        )}
        {phase === "done" && clip && (
          <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
            <a className="button button--go" href={clip.url} download={clip.name} style={{ fontSize: "1.4rem" }}>Save {clip.name}</a>
            <button type="button" className="button" onClick={start} style={{ fontSize: "1.4rem" }}>Retake</button>
          </div>
        )}
      </div>
    </main>
  );
}
