import { NextResponse } from 'next/server'
import { config } from '@/lib/config'

export async function GET() {
  try {
    // Return call config if all required fields are present
    if (
      config.callAudioUrl &&
      config.sessionStartTime &&
      config.callStartTime &&
      (config.callEndTime || config.callDuration)
    ) {
      return NextResponse.json({
        callAudioUrl: config.callAudioUrl,
        sessionStartTime: config.sessionStartTime,
        callStartTime: config.callStartTime,
        callEndTime: config.callEndTime,
        callDuration: config.callDuration,
      })
    }
    
    // Return empty object if call config is not available
    return NextResponse.json({})
  } catch (error) {
    console.error('Error fetching call config:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch call config' 
      },
      { status: 500 }
    )
  }
}

