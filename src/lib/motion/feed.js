// Browser-only: opens the camera and runs MediaPipe Pose Landmarker from this app's own origin.
// No video frame leaves the machine.
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { openCamera, pickCamera, saveCamera } from "./camera.js";
import { LandmarkSmoother, normalizeLandmarks } from "./landmarks.js";

async function createLandmarker(model, delegate) {
  const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `/mediapipe/pose_landmarker_${model}.task`, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export class PoseFeed {
  constructor({ model = "full" } = {}) {
    this.model = model;
    this.delegate = null;
    this.listeners = new Set();
    this.smoother = new LandmarkSmoother();
    this.stats = { fps: 0, inferenceMs: 0 };
    this.frames = [];
    this.running = false;
    this.lastVideoTime = -1;
    this.loop = 0;
  }

  async start(video) {
    this.video = video;
    // Browsers remove mediaDevices entirely on plain http addresses other than localhost.
    if (!navigator.mediaDevices) throw new DOMException("The camera needs a secure address", "InsecureContextError");
    this.stream = await openCamera();
    video.srcObject = this.stream;
    await video.play();

    try {
      this.landmarker = await createLandmarker(this.model, "GPU");
      this.delegate = "GPU";
    } catch {
      this.landmarker = await createLandmarker(this.model, "CPU").catch((cause) => {
        throw new DOMException(cause.message, "PoseTrackerError");
      });
      this.delegate = "CPU";
    }
    this.running = true;
    this.schedule();
  }

  // Screens own their video elements, so the frame loop has to move to the new one. A callback
  // left on an unmounted element never fires, which would silently stop tracking.
  attach(video) {
    this.video = video;
    video.srcObject = this.stream;
    this.loop += 1;
    this.schedule();
    return video.play();
  }

  get deviceId() {
    return this.stream?.getVideoTracks()[0]?.getSettings().deviceId ?? null;
  }

  // Swaps the camera under a running tracker. The new stream opens before the old one closes, so a
  // camera that fails to open leaves the player on the one that worked.
  async useCamera(deviceId) {
    const stream = await pickCamera(deviceId);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = stream;
    saveCamera(deviceId);
    this.smoother = new LandmarkSmoother(); // the last camera's pose would be smoothed into the new one
    this.lastVideoTime = -1;
    return this.attach(this.video);
  }

  schedule() {
    if (!this.running) return;
    const loop = this.loop;
    const next = () => {
      if (loop === this.loop) this.process();
    };
    if (this.video.requestVideoFrameCallback) this.video.requestVideoFrameCallback(next);
    else requestAnimationFrame(next);
  }

  process() {
    if (!this.running) return;
    const { video } = this;
    if (video.readyState >= 2 && video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      const t = performance.now();
      const result = this.landmarker.detectForVideo(video, t);
      this.stats.inferenceMs = this.stats.inferenceMs * 0.9 + (performance.now() - t) * 0.1;

      this.frames.push(t);
      while (this.frames.length && t - this.frames[0] > 1000) this.frames.shift();
      this.stats.fps = this.frames.length;

      const raw = result.landmarks[0];
      const aspect = video.videoWidth / video.videoHeight;
      const world = result.worldLandmarks?.[0];
      const points = raw ? this.smoother.push(normalizeLandmarks(raw, aspect, world), t) : null;
      const frame = { t, points, raw: raw ?? null, world: world ?? null, aspect };
      for (const listener of this.listeners) listener(frame);
    }
    this.schedule();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.landmarker?.close();
  }
}
