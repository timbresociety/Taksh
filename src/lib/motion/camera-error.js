// Turns a failed camera or pose tracker start into one instruction the player can act on.
export function cameraProblem(error, port = "3000") {
  switch (error.name) {
    case "InsecureContextError":
      return `Browsers only allow the camera on a secure address. Open http://localhost:${port} on this computer.`;
    case "NotAllowedError":
      return "Camera access is blocked. Allow it from the address bar and, on a Mac, for your browser in System Settings > Privacy & Security > Camera. Then try again.";
    case "NotFoundError":
      return "No camera was found. Connect one and try again, or play with the keyboard.";
    case "NotReadableError":
      return "The browser could not open the camera. Close any app using it and try again. If that fails, relaunch your browser.";
    case "PoseTrackerError":
      return "The camera works, but the pose tracker did not load. Try again, or play with the keyboard.";
    default:
      return `The camera did not start (${error.name}). Try again, or play with the keyboard.`;
  }
}
