/**
 * Configuration file for PostHog API credentials and session ID
 * 
 * All values are read from environment variables for security.
 * Create a .env.local file (see .env.example) with your credentials.
 * 
 * Required environment variables:
 * - POSTHOG_API_KEY: Your PostHog personal API key
 * - POSTHOG_PROJECT_ID: Your PostHog project ID
 * - POSTHOG_SESSION_ID: The session recording ID you want to replay
 * - POSTHOG_API_HOST: Your PostHog instance URL (default: https://us.posthog.com)
 * 
 * Optional environment variables for call recording sync:
 * - CALL_AUDIO_URL: URL to the call recording audio file (MP3)
 * - SESSION_START_TIME: Session start time in timestamptz format (e.g., "2025-09-02 20:21:51.526+00")
 * - CALL_START_TIME: Call start time in UTC format (e.g., "2025-09-02 20:22:00.227")
 * - CALL_END_TIME: Call end time in UTC format (e.g., "2025-09-02 20:25:30.500")
 * - CALL_DURATION: Call duration in milliseconds (optional, can be calculated from start/end times)
 */

function getRequiredEnv(key: string): string {
    const value = process.env[key]
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}. Please check your .env.local file.`)
    }
    return value
}

function getOptionalEnv(key: string): string | undefined {
    return process.env[key]
}

// Use a getter function to ensure env vars are read at access time, not import time
export const config = {
    get apiKey() {
        return getRequiredEnv('POSTHOG_API_KEY')
    },
    get projectId() {
        return getRequiredEnv('POSTHOG_PROJECT_ID')
    },
    get sessionId() {
        return getRequiredEnv('POSTHOG_SESSION_ID')
    },
    get apiHost() {
        return process.env.POSTHOG_API_HOST || 'https://us.posthog.com'
    },
    // Optional call recording configuration
    get callAudioUrl() {
        return getOptionalEnv('CALL_AUDIO_URL')
    },
    get sessionStartTime() {
        return getOptionalEnv('SESSION_START_TIME')
    },
    get callStartTime() {
        return getOptionalEnv('CALL_START_TIME')
    },
    get callEndTime() {
        return getOptionalEnv('CALL_END_TIME')
    },
    get callDuration() {
        return getOptionalEnv('CALL_DURATION')
    },
}
