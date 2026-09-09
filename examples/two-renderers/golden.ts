/**
 * Pinned on purpose. If vgpu changes Mesa versions the golden ceases to exist
 * under this name and the test fails on a missing file rather than on a pixel
 * difference — a far easier failure to diagnose.
 */
export const MESA = "25.0.7";
export const GOLDEN_FILE = `golden@mesa-${MESA}.bin`;

/**
 * Raw RGBA, not PNG. Decoding an image in the browser invites colour management
 * into a measurement whose whole subject is one-step-per-channel differences.
 */
export const GOLDEN_BYTES = 512 * 512 * 4;
