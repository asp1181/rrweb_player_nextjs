"use client";

import { useEffect, useState } from "react";
import Player from "@/components/Player";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerReady, setPlayerReady] = useState(false);

  useEffect(() => {
    async function loadSession() {
      try {
        setLoading(true);
        setError(null);
        // Fetch from API route (server-side) instead of directly calling fetchSessionData
        const response = await fetch("/api/session");
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to load session");
        }
        const { events: data } = await response.json();
        setEvents(data);
      } catch (err) {
        console.error("Error loading session:", err);
        setError(err instanceof Error ? err.message : "Failed to load session");
      } finally {
        setLoading(false);
      }
    }

    loadSession();
  }, []);

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: "#0c0a09", padding: "36px" }}
    >
      <div className="max-w-7xl mx-auto" style={{ backgroundColor: "#0c0a09" }}>
        <div className="mb-6" style={{ border: "none" }}>
          <h1
            className="text-3xl font-bold"
            style={{
              fontFamily: "var(--font-inter)",
              fontWeight: 700,
              color: "#fafaf9",
            }}
          >
            converlytik Session Replay Player
          </h1>
        </div>

        {loading && (
          <div
            className="text-card-foreground rounded-lg shadow-lg p-6"
            style={{ backgroundColor: "#0c0a09", border: "none" }}
          >
            {/* Status Badge */}
            <div style={{ marginBottom: "12px" }}>
              <Badge
                variant="secondary"
                style={{
                  borderRadius: "8px",
                  padding: "8px",
                  backgroundColor: "#fbbf24",
                  color: "#fafaf9",
                  fontFamily: "var(--font-inter)",
                  fontWeight: 400,
                  fontSize: "0.75rem",
                }}
              >
                Loading session recording...
              </Badge>
            </div>

            {/* Skeleton loader */}
            <Skeleton
              className="w-full h-[80vh] min-h-[600px] rounded-lg"
              style={{ backgroundColor: "#1c1917" }}
            />
          </div>
        )}

        {error && (
          <div
            className="rounded-lg p-4 mb-6"
            style={{ backgroundColor: "#0c0a09", border: "none" }}
          >
            <p className="text-destructive font-semibold">Error</p>
            <p className="text-destructive/80">{error}</p>
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <div
            className="text-card-foreground rounded-lg shadow-lg p-6"
            style={{ backgroundColor: "#0c0a09", border: "none" }}
          >
            {/* Status Badge */}
            <div style={{ marginBottom: "12px" }}>
              <Badge
                variant={playerReady ? "default" : "secondary"}
                style={{
                  borderRadius: "8px",
                  padding: "8px",
                  backgroundColor: playerReady ? "#22c55e" : "#fbbf24",
                  color: "#fafaf9",
                  fontFamily: "var(--font-inter)",
                  fontWeight: 400,
                  fontSize: "0.75rem",
                }}
              >
                {playerReady ? (
                  <span>Recording loaded successfully</span>
                ) : (
                  <span>Loading {events.length} events...</span>
                )}
              </Badge>
            </div>

            {/* Player with Skeleton overlay */}
            <div className="h-[80vh] min-h-[600px] relative">
              <Player events={events} onReady={() => setPlayerReady(true)} />
              {!playerReady && (
                <Skeleton
                  className="w-full h-full rounded-lg absolute inset-0"
                  style={{ backgroundColor: "#1c1917" }}
                />
              )}
            </div>
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div
            className="rounded-lg p-4"
            style={{ backgroundColor: "#0c0a09", border: "none" }}
          >
            <p className="text-yellow-800 dark:text-yellow-200">
              No events found
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
