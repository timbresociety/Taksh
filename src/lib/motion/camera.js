// Which camera the pose feed opens. With no saved choice it asks for the front camera, as it always
// has. A camera the player picks, such as an iPhone through Continuity Camera, is kept per browser.
const KEY = "taksh.camera";

export function videoConstraints(deviceId) {
  const size = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
  return deviceId ? { ...size, deviceId: { exact: deviceId } } : { ...size, facingMode: "user" };
}

// Storage can throw in a locked-down browser. The camera still works then, it just isn't remembered.
export function savedCamera(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function saveCamera(deviceId, storage = globalThis.localStorage) {
  try {
    if (deviceId) storage?.setItem(KEY, deviceId);
    else storage?.removeItem(KEY);
  } catch {}
}

export function pickCamera(deviceId, media = globalThis.navigator?.mediaDevices) {
  return media.getUserMedia({ audio: false, video: videoConstraints(deviceId) });
}

// A saved camera can be gone: an iPhone taken off its stand, or a webcam unplugged. Then the default
// camera opens and the choice is forgotten, so the game never fails on a camera the player can't see.
export async function openCamera(media = globalThis.navigator?.mediaDevices, storage = globalThis.localStorage) {
  const saved = savedCamera(storage);
  if (!saved) return pickCamera(null, media);
  try {
    return await pickCamera(saved, media);
  } catch (error) {
    if (error.name !== "OverconstrainedError" && error.name !== "NotFoundError") throw error;
    saveCamera(null, storage);
    return pickCamera(null, media);
  }
}
