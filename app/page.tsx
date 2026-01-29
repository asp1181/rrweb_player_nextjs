'use client'

import { useEffect, useState } from 'react'
import { fetchSessionData } from '@/lib/api'
import Player from '@/components/Player'

export default function Home() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playerReady, setPlayerReady] = useState(false)

  useEffect(() => {
    async function loadSession() {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchSessionData()
        setEvents(data)
      } catch (err) {
        console.error('Error loading session:', err)
        setError(err instanceof Error ? err.message : 'Failed to load session')
      } finally {
        setLoading(false)
      }
    }

    loadSession()
  }, [])

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Converlytik Session Replay Player
        </h1>

        {loading && (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading session recording...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 font-semibold">Error</p>
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="mb-4 text-sm">
              {playerReady ? (
                <span className="text-green-600 font-semibold">✅ Recording loaded successfully</span>
              ) : (
                <span className="text-gray-600">Loading {events.length} events...</span>
              )}
            </div>
            <div className="h-[80vh] min-h-[600px]">
              <Player events={events} onReady={() => setPlayerReady(true)} />
            </div>
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800">No events found</p>
          </div>
        )}
      </div>
    </main>
  )
}
