"use client";

import { useEffect, useRef, useState } from "react";
import { Calibrator } from "@/lib/motion/calibrate";
import { cameraProblem } from "@/lib/motion/camera-error";
import { PoseFeed } from "@/lib/motion/feed";
import { drawSkeleton } from "@/lib/motion/overlay";

export default function CalibrateStage({ feed, onDone, onKeyboard }) {
  const video = useRef(null);
  const overlay = useRef(null);
  const [status, setStatus] = useState({ message: "Starting the camera", progress: 0 });
  const [failure, setFailure] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    const calibrator = new Calibrator();

    async function start() {
      if (feed.current?.running) await feed.current.attach(video.current);
      else {
        feed.current = new PoseFeed();
        await feed.current.start(video.current);
      }
      if (cancelled) return;
      unsubscribe = feed.current.subscribe(({ points, t, aspect }) => {
        drawSkeleton(overlay.current, points, aspect);
        const result = calibrator.push(points, t);
        setStatus(result);
        if (result.done) onDone(result.calibration);
      });
    }

    start().catch((error) => {
      feed.current?.stop();
      setFailure(cameraProblem(error, window.location.port));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [feed, onDone, attempt]);

  function retry() {
    setFailure(null);
    setStatus({ message: "Starting the camera", progress: 0 });
    setAttempt((count) => count + 1);
  }

  return (
    <main className="calibrate">
      <div className="mirror">
        <video ref={video} playsInline muted />
        <canvas ref={overlay} />
      </div>
      <div className="calibrate__panel" data-testid="calibrate-status">
        <p className="calibrate__message" data-failed={Boolean(failure)} aria-live="polite">{failure ?? status.message}</p>
        <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(status.progress * 100)}>
          <span style={{ width: `${status.progress * 100}%` }} />
        </div>
        <p className="calibrate__hint">Stand about two to three metres back with your whole body in view, arms at your sides. Video stays on this device.</p>
        {failure && (
          <button type="button" className="button button--go" onClick={retry}>
            Try again
          </button>
        )}
        <button type="button" className="text-button" onClick={onKeyboard}>
          Play with keyboard instead
        </button>
      </div>
    </main>
  );
}
