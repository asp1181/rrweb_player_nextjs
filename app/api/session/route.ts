import { NextResponse } from 'next/server'
import { fetchSessionData } from '@/lib/api'

export async function GET() {
  try {
    const events = await fetchSessionData()
    return NextResponse.json({ events })
  } catch (error) {
    console.error('Error fetching session data:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch session data' 
      },
      { status: 500 }
    )
  }
}

