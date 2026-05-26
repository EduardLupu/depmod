/** Absolute path to the project being served (`depmod-ui <path>`). */
export function getTargetRoot(): string | null {
  const p = process.env.DEPMOD_TARGET_ROOT;
  return p && p.length > 0 ? p : null;
}
