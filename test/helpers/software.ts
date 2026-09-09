/** The pinned CPU renderer only exists on Linux. On Windows and macOS the GPU
 *  suites are skipped: that is not a concession, it is the only way the golden
 *  stays bit-for-bit stable. */
export const SOFTWARE = process.platform === "linux";
