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
 */

function getRequiredEnv(key: string): string {
    const value = process.env[key]
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}. Please check your .env.local file.`)
    }
    return value
}

export const config = {
    apiKey: getRequiredEnv('POSTHOG_API_KEY'),
    projectId: getRequiredEnv('POSTHOG_PROJECT_ID'),
    sessionId: getRequiredEnv('POSTHOG_SESSION_ID'),
    apiHost: process.env.POSTHOG_API_HOST || 'https://us.posthog.com',
}
