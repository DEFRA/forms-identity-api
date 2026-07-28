/**
 * Extract a human readable message from an unknown error
 * @param {unknown} error
 * @returns {string}
 */
export function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
