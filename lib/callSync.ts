/**
 * Utility functions for synchronizing call audio with session recording
 */

/**
 * Parses a timestamp string to Date object
 * Handles both formats:
 * - UTC: "2025-09-02 20:22:00.227"
 * - timestamptz: "2025-09-02 20:21:51.526+00"
 */
export function parseTimestamp(timestamp: string): Date {
  // Handle timestamptz format (with timezone offset)
  if (timestamp.includes('+') || timestamp.endsWith('Z')) {
    // Replace space with 'T' for ISO format, add 'Z' if not present
    const isoString = timestamp.replace(' ', 'T').replace(/([+-]\d{2}):(\d{2})$/, '$1$2')
    return new Date(isoString)
  }
  
  // Handle UTC format without timezone (assume UTC)
  const isoString = timestamp.replace(' ', 'T') + 'Z'
  return new Date(isoString)
}

/**
 * Calculates the time offset (in milliseconds) between session start and call start
 * Returns the delay before the audio should start playing
 */
export function calculateCallOffset(sessionStartTime: string, callStartTime: string): number {
  const sessionStart = parseTimestamp(sessionStartTime)
  const callStart = parseTimestamp(callStartTime)
  return callStart.getTime() - sessionStart.getTime()
}

/**
 * Calculates call duration in milliseconds
 * Uses callEndTime if provided, otherwise uses callDuration
 */
export function calculateCallDuration(
  callStartTime: string,
  callEndTime?: string,
  callDurationMs?: string
): number {
  if (callEndTime) {
    const start = parseTimestamp(callStartTime)
    const end = parseTimestamp(callEndTime)
    return end.getTime() - start.getTime()
  }
  
  if (callDurationMs) {
    return parseInt(callDurationMs, 10)
  }
  
  throw new Error('Either callEndTime or callDuration must be provided')
}

/**
 * Checks if the current session time is within the call period
 */
export function isWithinCallPeriod(
  sessionCurrentTime: number, // milliseconds since session start
  callOffset: number, // milliseconds from session start to call start
  callDuration: number // milliseconds
): boolean {
  return sessionCurrentTime >= callOffset && sessionCurrentTime <= (callOffset + callDuration)
}

/**
 * Calculates the audio playback position based on session time
 * Returns the position in the audio file (in seconds)
 */
export function calculateAudioPosition(
  sessionCurrentTime: number, // milliseconds since session start
  callOffset: number, // milliseconds from session start to call start
  playbackSpeed: number = 1
): number {
  if (sessionCurrentTime < callOffset) {
    return 0 // Before call starts
  }
  
  // Calculate how far into the call we are
  const timeIntoCall = (sessionCurrentTime - callOffset) / playbackSpeed
  return timeIntoCall / 1000 // Convert to seconds
}

