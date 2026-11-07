"use client";

import { useEffect, useState } from "react";

// Lists the cameras the browser can see. Names stay empty until the player allows the camera, so the
// list is read again once one is open (current changes), and whenever a camera comes or goes. An
// iPhone only appears through Continuity Camera once it is on a stand, in landscape and locked. On the
// build Mac, Safari listed it and Chrome 156 did not, though macOS had it.
export default function CameraPicker({ current, onPick }) {
  const [cameras, setCameras] = useState([]);

  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media?.enumerateDevices) return;
    const read = () =>
      media.enumerateDevices().then((devices) => setCameras(devices.filter((device) => device.kind === "videoinput" && device.label)));
    read();
    media.addEventListener("devicechange", read);
    return () => media.removeEventListener("devicechange", read);
  }, [current]);

  if (!cameras.length) return null;
  return (
    <div className="camera-picker">
      <label>
        Camera
        <select value={current ?? ""} onChange={(event) => onPick(event.target.value)} data-testid="camera-picker">
          {!cameras.some((camera) => camera.deviceId === current) && <option value="">Default camera</option>}
          {cameras.map((camera) => (
            <option key={camera.deviceId} value={camera.deviceId}>
              {camera.label}
            </option>
          ))}
        </select>
      </label>
      <p className="calibrate__hint">To use an iPhone on a Mac, stand it up in landscape about two metres away and lock it. It then shows up here. Safari lists it more reliably than Chrome.</p>
    </div>
  );
}
