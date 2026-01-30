'use client'

import { useEffect, useRef, useState } from 'react'
import { Replayer } from 'rrweb'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Play, Pause, Phone, Volume2, VolumeX } from 'lucide-react'
import {
  calculateCallOffset,
  calculateCallDuration,
  isWithinCallPeriod,
  calculateAudioPosition,
} from '@/lib/callSync'

interface PlayerProps {
  events: any[]
  onReady?: () => void
}

// Store events in a ref so we can access them in handleSeek
const eventsRef = { current: null as any[] | null }

export default function Player({ events, onReady }: PlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const replayerRef = useRef<any>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const lastAudioPositionRef = useRef<number>(-1) // Track last set audio position to prevent unnecessary updates
  const isSeekingRef = useRef<boolean>(false) // Flag to prevent time interval from overriding seek
  const seekBaseTimeRef = useRef<number | null>(null) // Track base time when replayer was recreated at a specific position
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  
  // Call sync state
  const [callConfig, setCallConfig] = useState<{
    audioUrl: string
    callOffset: number
    callDuration: number
  } | null>(null)
  const [audioCurrentTime, setAudioCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [firstEventTimestamp, setFirstEventTimestamp] = useState<number | null>(null)
  const [audioEnabled, setAudioEnabled] = useState(true) // Audio enabled by default

  // Initialize call sync configuration - fetch from API route
  useEffect(() => {
    async function loadCallConfig() {
      try {
        const response = await fetch('/api/call-config')
        if (!response.ok) {
          return // No call config available
        }
        const data = await response.json()
        
        if (data.callConfig === null || !data.callAudioUrl) {
          return // No call config available
        }
        
        const callOffset = calculateCallOffset(data.sessionStartTime, data.callStartTime)
        const callDuration = calculateCallDuration(
          data.callStartTime,
          data.callEndTime,
          data.callDuration
        )
        
        setCallConfig({
          audioUrl: data.callAudioUrl,
          callOffset,
          callDuration,
        })
      } catch (error) {
        console.error('Error loading call config:', error)
      }
    }
    
    loadCallConfig()
  }, [])

  useEffect(() => {
    if (!containerRef.current || !events || events.length === 0) {
      return
    }

    // Store events in ref for seeking
    eventsRef.current = events

    const container = containerRef.current
    container.innerHTML = ''

    // Store cleanup functions
    const cleanupFunctions: Array<() => void> = []
    
    // Defer initialization significantly to avoid blocking
    const initTimeout = setTimeout(() => {
      try {
        initializePlayer()
      } catch (error) {
        console.error('Error initializing player:', error)
      }
    }, 500) // Increased delay to let page fully render first

    function initializePlayer() {
      const containerRect = container.getBoundingClientRect()

      try {
        // Find viewport event for original device dimensions
      const viewportEvent = events.find((e: any) => (e?.type === 4 || e?.type === '4') && e?.data?.width && e?.data?.height)
      const originalWidth = viewportEvent?.data?.width || 390
      const originalHeight = viewportEvent?.data?.height || 699

      // Quick check for FullSnapshot - minimal processing
      const fullSnapshotEvent = events.find((e: any) => e?.type === 2 || e?.type === '2')
      
      if (!fullSnapshotEvent) {
        console.error('No FullSnapshot found in events')
        return
      }

      // Skip heavy processing - let rrweb handle it natively
      // Use events directly - rrweb handles sorting internally
      const processedEvents = events
      
      // Use requestAnimationFrame + setTimeout to defer heavy work
      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            const replayer = new Replayer(processedEvents, {
              root: container,
              liveMode: false,
              speed: playbackSpeed,
              // Enable mouse tail (trail) - this is separate from touch indicators
              mouseTail: true,
            })

            replayerRef.current = replayer
            
            // Reset current time to 0 when replayer is created
            setCurrentTime(0)
            seekBaseTimeRef.current = null // Clear base time on initial creation
            
            // Continue with setup - defer further to avoid blocking
            setTimeout(() => {
              const setupCleanup = setupReplayer(replayer)
              if (setupCleanup) {
                cleanupFunctions.push(setupCleanup)
              }
              
              // Call onReady callback after setup completes
              // Use a longer delay to ensure iframe is ready
              setTimeout(() => {
                if (onReady) {
                  onReady()
                }
              }, 800)
            }, 200)
          } catch (error) {
            console.error('Error creating replayer:', error)
            // Still call onReady even if there's an error
            if (onReady) {
              setTimeout(() => {
                onReady()
              }, 1000)
            }
          }
        }, 100)
      })
      
      function setupReplayer(replayer: any): (() => void) | null {
        // Set up event listeners
        replayer.on('start', () => {
          setIsPlaying(true)
        })

        replayer.on('pause', () => {
          setIsPlaying(false)
        })

        replayer.on('finish', () => {
          setIsPlaying(false)
        })

        // Center and scale the recording dynamically
        const centerAndScaleRecording = () => {
          try {
            const wrapper = container.querySelector('.replayer-wrapper') as HTMLElement
            if (!wrapper) {
              return
            }

            const containerRect = container.getBoundingClientRect()
            const containerWidth = containerRect.width
            const containerHeight = containerRect.height

            // Get original viewport dimensions from events
            const viewportEvent = events.find((e: any) => (e?.type === 4 || e?.type === '4') && e?.data?.width && e?.data?.height)
            const originalWidth = viewportEvent?.data?.width || 390
            const originalHeight = viewportEvent?.data?.height || 699

            // Calculate scale to fit within container while maintaining aspect ratio
            const scaleX = containerWidth / originalWidth
            const scaleY = containerHeight / originalHeight
            const scale = Math.min(scaleX, scaleY, 1) // Don't scale up, only down

            // Center the wrapper
            wrapper.style.position = 'absolute'
            wrapper.style.left = '50%'
            wrapper.style.top = '50%'
            wrapper.style.transform = `translate(-50%, -50%) scale(${scale})`
            wrapper.style.transformOrigin = 'center center'
            wrapper.style.width = `${originalWidth}px`
            wrapper.style.height = `${originalHeight}px`
          } catch (error) {
            console.error('Error centering recording:', error)
          }
        }

        // Center immediately and on resize
        setTimeout(centerAndScaleRecording, 500)
        setTimeout(centerAndScaleRecording, 1000)
        setTimeout(centerAndScaleRecording, 2000)

        // Watch for wrapper creation
        const checkWrapper = setInterval(() => {
          const wrapper = container.querySelector('.replayer-wrapper')
          if (wrapper) {
            centerAndScaleRecording()
            clearInterval(checkWrapper)
          }
        }, 100)

        // Cleanup interval after 10 seconds
        setTimeout(() => clearInterval(checkWrapper), 10000)

        // Handle window resize
        const handleResize = () => {
          centerAndScaleRecording()
        }
        window.addEventListener('resize', handleResize)

        // Calculate duration from events and store first event timestamp for seeking
        if (events.length > 0) {
          const firstEvent = events[0]
          const lastEvent = events[events.length - 1]
          if (firstEvent?.timestamp && lastEvent?.timestamp) {
            setDuration(lastEvent.timestamp - firstEvent.timestamp)
            setFirstEventTimestamp(firstEvent.timestamp)
          }
        }

        // Update current time periodically - use longer interval
        const timeInterval = setInterval(() => {
          // Don't update if we're currently seeking (prevents override)
          if (isSeekingRef.current) {
            return
          }
          
          if (replayerRef.current) {
            try {
              const replayerTime = replayerRef.current.getCurrentTime?.()
              
              // If we have a base time (from seeking), calculate actual time
              // The replayer shows the state at baseTime, but its internal time starts at 0
              // So we need to track: baseTime + (replayerTime - 0) = baseTime + replayerTime
              if (seekBaseTimeRef.current !== null) {
                // Replayer was recreated at seekBaseTimeRef.current
                // The replayer's time is relative to when it was created (starts at 0)
                // So we add the replayer's current time to the base time
                const replayerRelativeTime = typeof replayerTime === 'number' && replayerTime >= 0 ? replayerTime : 0
                const actualTime = seekBaseTimeRef.current + replayerRelativeTime
                
                // Only update if the calculated time is valid and reasonable
                if (actualTime >= 0 && !isNaN(actualTime) && actualTime <= duration + 1000) {
                  setCurrentTime(actualTime)
                } else {
                  // If calculated time is invalid, use the base time (we're at the seek position)
                  setCurrentTime(seekBaseTimeRef.current)
                }
              } else if (typeof replayerTime === 'number' && replayerTime >= 0 && !isNaN(replayerTime)) {
                // Normal playback - use replayer time directly
                setCurrentTime(replayerTime)
              } else {
                // Invalid time, keep current time if valid
                if (currentTime < 0 || isNaN(currentTime)) {
                  setCurrentTime(0)
                }
              }
            } catch (e) {
              // Ignore errors, keep current time
            }
          } else {
            // Replayer not ready yet, keep current time
          }
        }, 500) // Very long interval to reduce CPU usage

        // Set up touch indicators - they're inside the iframe
        const setupTouchIndicators = () => {
          try {
            const iframe = container.querySelector('iframe') as HTMLIFrameElement
            if (!iframe) return
            
            // Try to access iframe document
            let iframeDoc: Document | null = null
            try {
              iframeDoc = iframe.contentDocument || (iframe.contentWindow as any)?.document
            } catch (e) {
              // Cross-origin or sandboxed - can't access
              return
            }
            
            if (!iframeDoc) return
            
            // Style existing indicators
            const iframeIndicators = iframeDoc.querySelectorAll('.replayer-mouse')
            if (iframeIndicators.length > 0) {
              iframeIndicators.forEach((indicator) => {
                const el = indicator as HTMLElement
                el.style.setProperty('position', 'absolute', 'important')
                el.style.setProperty('z-index', '10000', 'important')
                el.style.setProperty('pointer-events', 'none', 'important')
                el.style.setProperty('visibility', 'visible', 'important')
                el.style.setProperty('opacity', '1', 'important')
                el.style.setProperty('display', 'block', 'important')
              })
            }
          } catch (e) {
            // Silently fail for cross-origin or sandboxed iframes
          }
        }

        // Inject CSS into iframe first
        const injectIframeStyles = () => {
          try {
            const iframe = container.querySelector('iframe') as HTMLIFrameElement
            if (!iframe) return
            
            let iframeDoc: Document | null = null
            try {
              iframeDoc = iframe.contentDocument || (iframe.contentWindow as any)?.document
            } catch (e) {
              // Cross-origin or sandboxed
              return
            }
            
            if (!iframeDoc) return
            
            const styleId = 'rrweb-touch-indicators-style'
            if (!iframeDoc.getElementById(styleId)) {
              const style = iframeDoc.createElement('style')
              style.id = styleId
              style.textContent = `
                .replayer-mouse {
                  position: absolute !important;
                  z-index: 10000 !important;
                  pointer-events: none !important;
                  visibility: visible !important;
                  opacity: 1 !important;
                  display: block !important;
                }
              `
              iframeDoc.head.appendChild(style)
            }
            
            // Also style existing indicators
            setupTouchIndicators()
          } catch (e) {
            // Silently fail for cross-origin
          }
        }
        
        // Watch for iframe creation and load
        const watchIframe = () => {
          const iframe = container.querySelector('iframe') as HTMLIFrameElement
          if (iframe) {
            // Inject styles when iframe loads
            iframe.addEventListener('load', () => {
              setTimeout(injectIframeStyles, 100)
            })
            
            // Try immediately if already loaded
            if (iframe.contentDocument) {
              injectIframeStyles()
            }
            
            // Watch for new indicators being added
            try {
              const iframeDoc = iframe.contentDocument || (iframe.contentWindow as any)?.document
              if (iframeDoc && iframeDoc.body) {
                const observer = new MutationObserver((mutations) => {
                  // Check if any new .replayer-mouse elements were added
                  let hasNewIndicators = false
                  mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                      if (node.nodeType === 1) { // Element node
                        const el = node as Element
                        if (el.classList?.contains('replayer-mouse') || el.querySelector?.('.replayer-mouse')) {
                          hasNewIndicators = true
                        }
                      }
                    })
                  })
                  if (hasNewIndicators) {
                    setupTouchIndicators()
                  }
                })
                observer.observe(iframeDoc.body, {
                  childList: true,
                  subtree: true
                })
                
                // Store observer for cleanup
                return () => {
                  observer.disconnect()
                }
              }
            } catch (e) {
              // Can't observe iframe - might be sandboxed, silently fail
            }
          }
        }
        
        // Try multiple times as iframe is created asynchronously
        setTimeout(watchIframe, 500)
        setTimeout(watchIframe, 1000)
        setTimeout(watchIframe, 2000)
        setTimeout(() => {
          watchIframe()
          injectIframeStyles()
          setupTouchIndicators()
        }, 3000)
        
        // Also check wrapper for indicators (they might be outside iframe)
        const checkWrapperIndicators = () => {
          try {
            const wrapper = container.querySelector('.replayer-wrapper')
            if (wrapper) {
              // Check for touch/mouse indicators
              const wrapperIndicators = wrapper.querySelectorAll('.replayer-mouse')
              // Also check for swipe/trail lines (red lines for mobile swipes)
              const swipeLines = wrapper.querySelectorAll('.replayer-mouse-tail')
              
              // Detect if this is a mobile recording (has swipe trails = touch events)
              const isMobileRecording = swipeLines.length > 0
              
              if (wrapperIndicators.length > 0) {
                wrapperIndicators.forEach((indicator) => {
                  const el = indicator as HTMLElement
                  // Apply visibility styles but don't override background-image or size
                  // Let rrweb handle touch vs mouse indicators (blue circle vs cursor)
                  el.style.setProperty('position', 'absolute', 'important')
                  el.style.setProperty('z-index', '10000', 'important')
                  el.style.setProperty('pointer-events', 'none', 'important')
                  el.style.setProperty('visibility', 'visible', 'important')
                  el.style.setProperty('opacity', '1', 'important')
                  el.style.setProperty('display', 'block', 'important')
                  // Don't force width/height - rrweb sets appropriate size
                  // Don't override background-image - rrweb uses different images for touch vs mouse
                  
                  // Force remove any hiding styles
                  el.style.removeProperty('display')
                  el.style.removeProperty('visibility')
                  el.style.removeProperty('opacity')
                  // Then reapply
                  el.style.setProperty('display', 'block', 'important')
                  el.style.setProperty('visibility', 'visible', 'important')
                  el.style.setProperty('opacity', '1', 'important')
                  
                  const computed = window.getComputedStyle(el)
                  
                  // Customize touch indicators - we have full control since we control the data
                  // If this is a mobile recording (has swipe trails), style as blue circle
                  if (isMobileRecording) {
                    // Custom blue circle for touch indicators
                    // You can customize these values to any design you want:
                    el.style.setProperty('background-image', 'none', 'important')
                    el.style.setProperty('background-color', 'rgba(59, 130, 246, 0.8)', 'important') // Blue - change color here
                    el.style.setProperty('border', '2px solid rgba(59, 130, 246, 1)', 'important') // Border color
                    el.style.setProperty('border-radius', '50%', 'important') // Circle - change to square, etc.
                    el.style.setProperty('width', '24px', 'important') // Size - customize as needed
                    el.style.setProperty('height', '24px', 'important')
                    el.style.setProperty('box-shadow', '0 0 8px rgba(59, 130, 246, 0.6)', 'important') // Glow effect
                  }
                })
              }
              
              // Style swipe/trail lines (red lines for mobile swipes)
              if (swipeLines.length > 0) {
                swipeLines.forEach((line) => {
                  const el = line as HTMLElement
                  el.style.setProperty('position', 'absolute', 'important')
                  el.style.setProperty('z-index', '9999', 'important')
                  el.style.setProperty('pointer-events', 'none', 'important')
                  el.style.setProperty('visibility', 'visible', 'important')
                  el.style.setProperty('opacity', '1', 'important')
                })
              }
            }
          } catch (e) {
            // Silently fail - indicators are optional
          }
        }
        
        // Check more frequently and also during playback
        setTimeout(checkWrapperIndicators, 500)
        setTimeout(checkWrapperIndicators, 1000)
        setTimeout(checkWrapperIndicators, 2000)
        setTimeout(checkWrapperIndicators, 3000)
        
        // Also check periodically during playback
        const indicatorCheckInterval = setInterval(() => {
          checkWrapperIndicators()
        }, 1000)
        
        // Return cleanup function
        return () => {
          if (indicatorCheckInterval) {
            clearInterval(indicatorCheckInterval)
          }
          if (timeInterval) {
            clearInterval(timeInterval)
          }
          window.removeEventListener('resize', handleResize)
          if (replayerRef.current) {
            replayerRef.current.pause()
          }
        }
      }
      } catch (error) {
        console.error('Error in initializePlayer:', error)
      }
    }

    return () => {
      clearTimeout(initTimeout)
      cleanupFunctions.forEach(fn => fn())
    }
  }, [events])

  // Separate effect for audio sync
  useEffect(() => {
    if (!callConfig || !audioRef.current || !audioEnabled) {
      // If audio is disabled, pause it
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause()
      }
      return
    }

    const audio = audioRef.current
    const isInCallPeriod = isWithinCallPeriod(currentTime, callConfig.callOffset, callConfig.callDuration)
    
    if (isInCallPeriod) {
      // We're in the call period - sync audio position
      const audioPosition = calculateAudioPosition(currentTime, callConfig.callOffset, playbackSpeed)
      
      // Only update if there's a significant difference AND we haven't set this position recently
      // This prevents the audio from resetting/looping
      const timeDiff = audioPosition - audio.currentTime
      const positionDiff = Math.abs(audioPosition - lastAudioPositionRef.current)
      
      // Only seek if:
      // 1. There's a significant difference (> 0.5s)
      // 2. We're moving forward OR there's a large backward jump (> 2s) - prevents accidental resets
      // 3. We haven't just set this position (prevents rapid re-seeking)
      if (Math.abs(timeDiff) > 0.5 && (timeDiff > 0 || Math.abs(timeDiff) > 2) && positionDiff > 0.1) {
        audio.currentTime = audioPosition
        lastAudioPositionRef.current = audioPosition
      }
      
      // Auto-start audio if session is playing and audio is paused
      // Only play if audio is ready and not already playing
      if (isPlaying && audio.paused && audio.readyState >= 2) {
        audio.play().catch((e) => {
          console.error('Error playing audio:', e)
        })
      }
    } else {
      // Outside call period - pause audio
      if (!audio.paused) {
        audio.pause()
      }
      // Only reset audio position if we're significantly before call start (not just entering)
      // This prevents resetting when we're right at the boundary
      if (currentTime < callConfig.callOffset - 100) {
        // Only reset if we're more than 100ms before call start and audio isn't already at 0
        if (audio.currentTime > 0.1 && lastAudioPositionRef.current !== 0) {
          audio.currentTime = 0
          lastAudioPositionRef.current = 0
        }
      } else if (currentTime > callConfig.callOffset + callConfig.callDuration) {
        // Past call end - stop at end (but don't reset if already at end)
        const endTime = audio.duration || 0
        if (audio.currentTime < endTime - 0.1 && lastAudioPositionRef.current !== endTime) {
          audio.currentTime = endTime
          lastAudioPositionRef.current = endTime
        }
      }
    }
  }, [currentTime, callConfig, playbackSpeed, isPlaying, audioEnabled])

  // Format time helper function
  const formatTime = (ms: number): string => {
    // Ensure we have a valid number
    if (!ms || isNaN(ms) || ms < 0) {
      return '0:00'
    }
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const handlePlayPause = () => {
    if (!replayerRef.current) {
      return
    }

    try {
      if (isPlaying) {
        replayerRef.current.pause()
        // Pause audio if playing and enabled
        if (audioRef.current && !audioRef.current.paused && audioEnabled) {
          audioRef.current.pause()
        }
      } else {
        // If we have a base time (from seeking), the replayer was created with events up to targetTime
        // When we call play(), it will replay from the beginning of those events, which resets the visual.
        // 
        // Solution: Create a new replayer with ALL events, but we'll track the time offset.
        // This way, the replayer can continue playing from the current position.
        if (seekBaseTimeRef.current !== null && firstEventTimestamp !== null) {
          // We're at a seek position - recreate with all events to allow proper playback
          const currentEvents = eventsRef.current || events
          const targetTimestamp = firstEventTimestamp + currentTime
          
          // Get all events up to current time (to show correct state)
          const eventsUpToCurrent = currentEvents.filter((event: any) => {
            if (!event || !event.timestamp) return false
            return event.timestamp <= targetTimestamp
          })
          
          // Ensure FullSnapshot is first
          const fullSnapshot = eventsUpToCurrent.find((e: any) => e?.type === 2 || e?.type === '2')
          const otherEvents = eventsUpToCurrent.filter((e: any) => e?.type !== 2 && e?.type !== '2')
          const sortedEvents = fullSnapshot ? [fullSnapshot, ...otherEvents] : eventsUpToCurrent
          
          if (sortedEvents.length >= 2) {
            // Just play the existing replayer - it will replay from the beginning of its events
            // but we track time with seekBaseTimeRef, so the UI shows correct time
            // Note: This will cause a visual reset, but it's a limitation of the current approach
            replayerRef.current.play()
            
            // Resume audio if in call period
            if (audioRef.current && callConfig && audioEnabled) {
              const isInCallPeriod = isWithinCallPeriod(currentTime, callConfig.callOffset, callConfig.callDuration)
              if (isInCallPeriod) {
                audioRef.current.play().catch((e) => {
                  console.error('Error playing audio:', e)
                })
              }
            }
            return
          }
        }
        
        // Normal playback - just play
        replayerRef.current.play()
        // Play audio if we're in the call period and audio is enabled
        if (audioRef.current && callConfig && audioEnabled) {
          const isInCallPeriod = isWithinCallPeriod(currentTime, callConfig.callOffset, callConfig.callDuration)
          if (isInCallPeriod) {
            audioRef.current.play().catch((e) => {
              console.error('Error playing audio:', e)
            })
          }
        }
      }
    } catch (error) {
      console.error('Error in play/pause:', error)
    }
  }

  const handleAudioToggle = () => {
    const newAudioEnabled = !audioEnabled
    setAudioEnabled(newAudioEnabled)
    
    if (audioRef.current) {
      if (!newAudioEnabled) {
        // Disabling - pause audio immediately
        if (!audioRef.current.paused) {
          audioRef.current.pause()
        }
      } else {
        // Enabling - start audio if we're playing and in call period
        if (isPlaying && callConfig) {
          const isInCallPeriod = isWithinCallPeriod(currentTime, callConfig.callOffset, callConfig.callDuration)
          if (isInCallPeriod) {
            audioRef.current.play().catch((e) => {
              console.error('Error playing audio:', e)
            })
          }
        }
      }
    }
  }

  const handleSpeedChange = (speed: number) => {
    if (!replayerRef.current) return
    setPlaybackSpeed(speed)
    replayerRef.current.setConfig({ speed })
    
    // Sync audio playback speed
    if (audioRef.current) {
      audioRef.current.playbackRate = speed
    }
  }

  // Helper function to recreate replayer at a specific position
  const recreateReplayerAtPosition = (eventsToApply: any[], targetTime: number, shouldPlay: boolean) => {
    if (!containerRef.current) return
    
    try {
      const container = containerRef.current
      const currentEvents = eventsRef.current || events
      const viewportEvent = currentEvents.find((e: any) => (e?.type === 4 || e?.type === '4') && e?.data?.width && e?.data?.height)
      const originalWidth = viewportEvent?.data?.width || 390
      const originalHeight = viewportEvent?.data?.height || 699
      
      // Ensure we have at least 2 events (replayer requirement)
      // If we only have FullSnapshot, add the next event after it
      if (eventsToApply.length < 2) {
        const fullSnapshot = eventsToApply.find((e: any) => e?.type === 2 || e?.type === '2')
        if (fullSnapshot && currentEvents.length > 1) {
          // Find the next event after FullSnapshot
          const fullSnapshotIndex = currentEvents.findIndex((e: any) => e === fullSnapshot)
          if (fullSnapshotIndex >= 0 && fullSnapshotIndex < currentEvents.length - 1) {
            eventsToApply = [fullSnapshot, currentEvents[fullSnapshotIndex + 1]]
          }
        }
      }
      
      if (eventsToApply.length < 2) {
        console.error('Cannot recreate replayer: need at least 2 events, got', eventsToApply.length)
        return
      }
      
      // Clear container
      container.innerHTML = ''
      
      // Create new replayer with events
      // IMPORTANT: If eventsToApply contains all events, the replayer will show the final state
      // If eventsToApply contains only events up to targetTime, it will show the state at targetTime
      // The replayer applies all events synchronously when created
      const newReplayer = new Replayer(eventsToApply, {
        root: container,
        liveMode: false,
        speed: playbackSpeed,
        mouseTail: true,
      })
      
      replayerRef.current = newReplayer
      
      // Set base time - when replayer plays, we'll add its time to this base
      // The replayer shows the state at targetTime, but its internal time starts at 0
      // So we track: actualTime = targetTime + replayerTime
      seekBaseTimeRef.current = targetTime
      
      // Set current time immediately - the replayer shows the state at targetTime
      setCurrentTime(targetTime)
      
      // CRITICAL: The replayer is created in a paused state showing the final state of eventsToApply
      // This is the correct visual state at targetTime. We should NOT call play() immediately
      // because that would start playing from the beginning of eventsToApply, not from the end.
      // Instead, we'll keep it paused and only play if the user was playing before seeking.
      
      // Set up event listeners for the new replayer
      newReplayer.on('start', () => {
        setIsPlaying(true)
      })
      newReplayer.on('pause', () => {
        setIsPlaying(false)
      })
      newReplayer.on('finish', () => {
        setIsPlaying(false)
      })
      
      // Re-center and scale
      setTimeout(() => {
        const wrapper = container.querySelector('.replayer-wrapper') as HTMLElement
        if (wrapper) {
          const containerRect = container.getBoundingClientRect()
          const scaleX = containerRect.width / originalWidth
          const scaleY = containerRect.height / originalHeight
          const scale = Math.min(scaleX, scaleY, 1)
          wrapper.style.position = 'absolute'
          wrapper.style.left = '50%'
          wrapper.style.top = '50%'
          wrapper.style.transform = `translate(-50%, -50%) scale(${scale})`
          wrapper.style.transformOrigin = 'center center'
          wrapper.style.width = `${originalWidth}px`
          wrapper.style.height = `${originalHeight}px`
        }
        
        // Re-setup touch indicators and iframe styles
        setTimeout(() => {
          const iframe = container.querySelector('iframe')
          if (iframe && iframe.contentDocument) {
            // Re-inject styles for touch indicators
            const styleId = 'rrweb-touch-indicators'
            if (!iframe.contentDocument.getElementById(styleId)) {
              const style = iframe.contentDocument.createElement('style')
              style.id = styleId
              style.textContent = `
                .replayer-mouse {
                  display: block !important;
                  width: 20px !important;
                  height: 20px !important;
                  border-radius: 50% !important;
                  background-color: #3b82f6 !important;
                  border: 2px solid white !important;
                  box-shadow: 0 0 4px rgba(59, 130, 246, 0.8) !important;
                  pointer-events: none !important;
                  z-index: 10000 !important;
                }
                .replayer-mouse-tail {
                  display: block !important;
                  background-color: #ef4444 !important;
                  opacity: 0.6 !important;
                  pointer-events: none !important;
                }
              `
              iframe.contentDocument.head.appendChild(style)
            }
          }
        }, 100)
        
        isSeekingRef.current = false
        
        // IMPORTANT: Don't call play() automatically after seeking
        // The replayer is showing the correct state at targetTime (paused)
        // If shouldPlay is true, handlePlayPause will handle it when the user clicks play
        // This prevents the visual reset issue
        // The issue is that if we create a replayer with events up to targetTime,
        // and then call play(), it will replay those events from the beginning.
        // 
        // The correct approach would be to create a replayer with ALL events, but
        // use a method to jump to the target time. However, rrweb doesn't have a goto method.
        //
        // For now, we'll keep it paused and let the user manually play.
        // When they play, we'll need to create a new replayer with events from targetTime onwards.
      }, 300)
    } catch (error) {
      console.error('Error recreating replayer:', error)
      setCurrentTime(targetTime)
      isSeekingRef.current = false
    }
  }

  const handleSeek = (timeInMs: number) => {
    if (!replayerRef.current || firstEventTimestamp === null) return
    const currentEvents = eventsRef.current || events
    if (!currentEvents || currentEvents.length === 0) return
    
    try {
      // Set seeking flag to prevent time interval from overriding
      isSeekingRef.current = true
      
      // Pause before seeking to ensure clean state
      const wasPlaying = isPlaying
      setIsPlaying(false) // Set playing state to false immediately
      if (wasPlaying && replayerRef.current) {
        replayerRef.current.pause()
      }
      
      // Pause audio immediately when seeking starts
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause()
      }
      
      // Calculate target absolute timestamp
      const targetTimestamp = firstEventTimestamp + timeInMs
      
      // Find all events up to the target timestamp (inclusive)
      const eventsUpToTarget = currentEvents.filter((event: any) => {
        if (!event || !event.timestamp) return false
        return event.timestamp <= targetTimestamp
      })
      
      // Ensure FullSnapshot is first (required by rrweb)
      const fullSnapshot = eventsUpToTarget.find((e: any) => e?.type === 2 || e?.type === '2')
      const otherEvents = eventsUpToTarget.filter((e: any) => e?.type !== 2 && e?.type !== '2')
      const sortedEvents = fullSnapshot ? [fullSnapshot, ...otherEvents] : eventsUpToTarget
      
      console.log('🔍 Seeking:', {
        timeInMs,
        targetTimestamp,
        totalEvents: currentEvents.length,
        eventsUpToTarget: sortedEvents.length,
        hasFullSnapshot: !!fullSnapshot,
      })
      
      // Skip applyEventsSynchronously - it has DOM errors
      // Always use recreateReplayerAtPosition which is more reliable
      recreateReplayerAtPosition(sortedEvents, timeInMs, wasPlaying)
      
      // Sync audio position after seeking (only if audio is enabled)
      // Note: Audio is already paused at the start of handleSeek
      if (audioRef.current && callConfig && audioEnabled) {
        const isInCallPeriod = isWithinCallPeriod(timeInMs, callConfig.callOffset, callConfig.callDuration)
        if (isInCallPeriod) {
          const audioPosition = calculateAudioPosition(timeInMs, callConfig.callOffset, playbackSpeed)
          audioRef.current.currentTime = audioPosition
          lastAudioPositionRef.current = audioPosition
          // Don't auto-resume audio after seeking - user can click play to continue
          // This prevents audio from playing when the visual resets
          // Audio will resume in handlePlayPause when user clicks play
        } else {
          // Outside call period - ensure audio is paused and reset position
          audioRef.current.pause()
          if (timeInMs < callConfig.callOffset) {
            audioRef.current.currentTime = 0
            lastAudioPositionRef.current = 0
          } else {
            // Past call end
            const endTime = audioRef.current.duration || 0
            audioRef.current.currentTime = endTime
            lastAudioPositionRef.current = endTime
          }
        }
      } else if (audioRef.current && !audioEnabled) {
        // Audio disabled - ensure it's paused
        audioRef.current.pause()
      }
    } catch (e) {
      console.error('Error seeking:', e)
      isSeekingRef.current = false // Clear flag on error
    }
  }

  // Calculate call timeline markers for visual indicator
  const callStartPercent = callConfig && duration > 0
    ? (callConfig.callOffset / duration) * 100
    : 0
  const callEndPercent = callConfig && duration > 0
    ? ((callConfig.callOffset + callConfig.callDuration) / duration) * 100
    : 0

  return (
    <div className="flex flex-col h-full">
      {/* Hidden audio element */}
      {callConfig && (
        <audio
          ref={audioRef}
          src={callConfig.audioUrl}
          preload="metadata"
          onLoadedMetadata={() => {
            if (audioRef.current) {
              setAudioDuration(audioRef.current.duration * 1000)
            }
          }}
          onTimeUpdate={() => {
            if (audioRef.current) {
              setAudioCurrentTime(audioRef.current.currentTime * 1000)
            }
          }}
          onEnded={() => {
            // Ensure audio doesn't loop
            if (audioRef.current) {
              audioRef.current.currentTime = audioRef.current.duration || 0
              setAudioCurrentTime((audioRef.current.duration || 0) * 1000)
            }
          }}
        />
      )}
      
      <div 
        ref={containerRef} 
        className="flex-1 overflow-hidden relative player-container"
        style={{ minHeight: '600px' }}
      />
      
      {/* Playbar - Styled with ShadCN components */}
      <div className="rounded-b" style={{ backgroundColor: '#0c0a09', marginTop: '12px', paddingLeft: '16px', paddingRight: '16px', paddingTop: '16px', paddingBottom: '16px' }}>
        <div className="flex items-center" style={{ fontFamily: 'var(--font-inter)', fontWeight: 400, color: '#fafaf9', gap: '16px' }}>
          {/* Play/Pause Button */}
          <Button
            onClick={handlePlayPause}
            size="icon"
            variant="default"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            style={{ borderWidth: '0' }}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          {/* Divider between play and audio */}
          {callConfig && (
            <div style={{ width: '1px', height: '24px', backgroundColor: '#3f3f46', marginLeft: '8px', marginRight: '8px' }} />
          )}

          {/* Audio Toggle Button - only show if call config exists */}
          {callConfig && (
            <>
              <div className="relative">
                <Button
                  onClick={handleAudioToggle}
                  size="icon"
                  variant={audioEnabled ? 'default' : 'outline'}
                  aria-label={audioEnabled ? 'Mute audio' : 'Unmute audio'}
                  style={{ borderWidth: '0' }}
                >
                  {audioEnabled ? (
                    <Volume2 className="h-4 w-4" />
                  ) : (
                    <VolumeX className="h-4 w-4" />
                  )}
                </Button>
                {/* Visual indicator when muted */}
                {!audioEnabled && (
                  <div
                    className="absolute -top-1 -right-1 w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: '#ef4444',
                      border: '2px solid #0c0a09',
                      boxShadow: '0 0 4px rgba(239, 68, 68, 0.8)',
                    }}
                    title="Audio muted"
                  />
                )}
              </div>
              {/* Call Duration */}
              <span className="text-sm font-mono tabular-nums" style={{ color: '#fafaf9', fontFamily: 'var(--font-inter)', fontWeight: 400, minWidth: '3rem' }}>
                {formatTime(callConfig.callDuration)}
              </span>
            </>
          )}

          {/* Divider between call duration and speed */}
          {callConfig && (
            <div style={{ width: '1px', height: '24px', backgroundColor: '#3f3f46', marginLeft: '8px', marginRight: '8px' }} />
          )}

          {/* Speed Control */}
          <div className="flex items-center" style={{ gap: '8px' }}>
            <span className="text-sm" style={{ color: '#fafaf9', fontFamily: 'var(--font-inter)', fontWeight: 400 }}>Speed:</span>
            {[1, 2].map((speed) => (
              <Button
                key={speed}
                onClick={() => handleSpeedChange(speed)}
                variant={playbackSpeed === speed ? 'default' : 'outline'}
                size="sm"
                style={{ 
                  fontFamily: 'var(--font-inter)', 
                  fontWeight: 400, 
                  color: playbackSpeed === speed ? '#fafaf9' : '#0c0a09',
                  borderWidth: '1px'
                }}
              >
                {speed}x
              </Button>
            ))}
          </div>

          {/* Timeline - ShadCN Slider with time display and call indicator */}
          <div className="flex-1 flex items-center">
            {/* Start time */}
            <span className="text-sm min-w-[4rem] text-right font-mono tabular-nums" style={{ color: '#fafaf9', fontFamily: 'var(--font-inter)', fontWeight: 400, marginRight: '16px' }}>
              {formatTime(currentTime)}
            </span>
            
            {/* Progress slider with call indicator - read-only for prototype */}
            <div className="flex-1 relative">
              <Slider
                value={duration > 0 ? [currentTime / 1000] : [0]}
                min={0}
                max={duration > 0 ? duration / 1000 : 100}
                step={0.1}
                className="flex-1"
                disabled={true}
                style={{ 
                  pointerEvents: 'none', 
                  cursor: 'default',
                  height: '8px'
                }}
              />
              {/* Call start indicator - phone icon only */}
              {callConfig && duration > 0 && callStartPercent < 100 && (
                <div
                  className="absolute pointer-events-none flex items-center justify-center"
                  style={{
                    left: `${callStartPercent}%`,
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 3,
                    width: '20px',
                    height: '20px',
                    backgroundColor: '#22c55e',
                    borderRadius: '50%',
                    padding: '4px',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3), 0 0 8px rgba(34, 197, 94, 0.6)',
                  }}
                  title="Call started"
                >
                  <Phone className="h-3 w-3" style={{ color: '#ffffff' }} />
                </div>
              )}
            </div>
            
            {/* End time */}
            <span className="text-sm min-w-[4rem] font-mono tabular-nums" style={{ color: '#fafaf9', fontFamily: 'var(--font-inter)', fontWeight: 400, marginLeft: '16px' }}>
              {formatTime(duration || 0)}
            </span>
          </div>
        </div>
      </div>

    </div>
  )
}

