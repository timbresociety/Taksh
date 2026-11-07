"use client";

import { useEffect, useRef, useState } from "react";
import { Calibrator } from "@/lib/motion/calibrate";
import { saveCamera } from "@/lib/motion/camera";
import { cameraProblem } from "@/lib/motion/camera-error";
import { PoseFeed } from "@/lib/motion/feed";
import { drawSkeleton } from "@/lib/motion/overlay";
import CameraPicker from "./CameraPicker";

export default function CalibrateStage({ feed, framing, onDone, onKeyboard }) {
  const video = useRef(null);
  const overlay = useRef(null);
  const [status, setStatus] = useState({ message: "Starting the camera", progress: 0 });
  const [failure, setFailure] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [camera, setCamera] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    const calibrator = new Calibrator({ framing });

    async function start() {
      if (feed.current?.running) await feed.current.attach(video.current);
      else {
        // React can mount this screen twice at once. A second start would abort the first, and leave
        // two camera streams open, so both wait on the same one.
        feed.current ??= new PoseFeed();
        feed.current.starting ??= feed.current.start(video.current);
        await feed.current.starting;
      }
      if (cancelled) return;
      setCamera(feed.current.deviceId);
      unsubscribe = feed.current.subscribe(({ points, t, aspect }) => {
        if (overlay.current) drawSkeleton(overlay.current, points, aspect); // a last frame can land after this screen has gone
        const result = calibrator.push(points, t);
        setStatus(result);
        if (result.done) onDone(result.calibration);
      });
    }

    start().catch((error) => {
      feed.current?.stop();
      feed.current = null;
      if (!cancelled) setFailure(cameraProblem(error, window.location.port));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [feed, framing, onDone, attempt]);

  function retry() {
    setFailure(null);
    setStatus({ message: "Starting the camera", progress: 0 });
    setAttempt((count) => count + 1);
  }

  // Another camera frames the player differently, so calibration starts over on it.
  async function pick(deviceId) {
    if (!deviceId || deviceId === camera) return;
    try {
      if (feed.current?.running) await feed.current.useCamera(deviceId);
      else saveCamera(deviceId); // the camera failed to start, so the next try opens this one
      retry();
    } catch (error) {
      setFailure(cameraProblem(error, window.location.port));
    }
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
        <p className="calibrate__hint">
          {framing === "full" ? "Stand about two to three metres back with your whole body in view, arms at your sides." : "Sit or stand with your head, shoulders and both hands in view."} Video stays on this device.
        </p>
        <CameraPicker current={camera} onPick={pick} />
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
