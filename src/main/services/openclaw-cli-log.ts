/**
 * OpenClaw exposes repair as the `doctor` subcommand; raw stdout still says "Doctor" / "doctor".
 * Enchante labels this pass "Fixer" in the UI — normalize logs so the last step doesn't read like a medical term.
 */
export function sanitizeOpenclawRepairLog(msg: string): string {
  return msg.replace(/\bdoctor\b/gi, 'Fixer')
}
