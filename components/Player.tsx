'use client'

import { useEffect, useRef, useState } from 'react'
import { Replayer } from 'rrweb'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Play, Pause } from 'lucide-react'

interface PlayerProps {
  events: any[]
  onReady?: () => void
}

export default function Player({ events, onReady }: PlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const replayerRef = useRef<any>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)

  useEffect(() => {
    if (!containerRef.current || !events || events.length === 0) {
      console.log('⚠️ Player: Missing container or events', {
        hasContainer: !!containerRef.current,
        eventsCount: events?.length || 0
      })
      return
    }

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
      // Check container dimensions
      const containerRect = container.getBoundingClientRect()
      console.log('Container dimensions:', { width: containerRect.width, height: containerRect.height })

      console.log('🚀 Initializing player...', {
        eventsCount: events.length,
        containerSize: { width: containerRect.width, height: containerRect.height }
      })

      try {
        // Find viewport event for original device dimensions
      const viewportEvent = events.find((e: any) => (e?.type === 4 || e?.type === '4') && e?.data?.width && e?.data?.height)
      const originalWidth = viewportEvent?.data?.width || 390
      const originalHeight = viewportEvent?.data?.height || 699

      // Quick check for FullSnapshot - minimal processing
      const fullSnapshotEvent = events.find((e: any) => e?.type === 2 || e?.type === '2')
      
      if (!fullSnapshotEvent) {
        console.error('❌ No FullSnapshot found')
        return
      }
      
      console.log('✅ FullSnapshot found')

      // Skip heavy processing - let rrweb handle it natively
      // Use events directly - rrweb handles sorting internally
      const processedEvents = events
      console.log('✅ Using events directly (minimal processing)')

      // Create replayer - defer significantly to avoid blocking main thread
      console.log('🔧 Creating Replayer with', processedEvents.length, 'events')
      
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
            console.log('✅ Replayer created')
            
            // Reset current time to 0 when replayer is created
            setCurrentTime(0)
            
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
                  console.log('✅ Player ready - calling onReady')
                  onReady()
                }
              }, 800)
            }, 200)
          } catch (error) {
            console.error('Error creating replayer:', error)
            // Still call onReady even if there's an error
            if (onReady) {
              setTimeout(() => {
                console.log('⚠️ Player created with errors - calling onReady anyway')
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
              console.log('⚠️ Wrapper not found yet, will retry...')
              return
            }

            const containerRect = container.getBoundingClientRect()
            const containerWidth = containerRect.width
            const containerHeight = containerRect.height

            // Get original viewport dimensions from events
            const viewportEvent = events.find((e: any) => (e?.type === 4 || e?.type === '4') && e?.data?.width && e?.data?.height)
            const originalWidth = viewportEvent?.data?.width || 390
            const originalHeight = viewportEvent?.data?.height || 699

            console.log('📐 Centering recording:', {
              container: { width: containerWidth, height: containerHeight },
              original: { width: originalWidth, height: originalHeight }
            })

            // Calculate scale to fit within container while maintaining aspect ratio
            const scaleX = containerWidth / originalWidth
            const scaleY = containerHeight / originalHeight
            const scale = Math.min(scaleX, scaleY, 1) // Don't scale up, only down

            // Calculate scaled dimensions
            const scaledWidth = originalWidth * scale
            const scaledHeight = originalHeight * scale

            // Center the wrapper
            wrapper.style.position = 'absolute'
            wrapper.style.left = '50%'
            wrapper.style.top = '50%'
            wrapper.style.transform = `translate(-50%, -50%) scale(${scale})`
            wrapper.style.transformOrigin = 'center center'
            wrapper.style.width = `${originalWidth}px`
            wrapper.style.height = `${originalHeight}px`

            console.log('✅ Recording centered and scaled:', {
              scale,
              scaledDimensions: { width: scaledWidth, height: scaledHeight },
              wrapperDimensions: { width: originalWidth, height: originalHeight }
            })
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

        // Calculate duration from events
        if (events.length > 0) {
          const firstEvent = events[0]
          const lastEvent = events[events.length - 1]
          if (firstEvent?.timestamp && lastEvent?.timestamp) {
            setDuration(lastEvent.timestamp - firstEvent.timestamp)
          }
        }

        // Update current time periodically - use longer interval
        const timeInterval = setInterval(() => {
          if (replayerRef.current) {
            try {
              const current = replayerRef.current.getCurrentTime?.()
              // Only update if we have a valid number and it's >= 0
              if (typeof current === 'number' && current >= 0 && !isNaN(current)) {
                setCurrentTime(current)
              } else {
                setCurrentTime(0)
              }
            } catch (e) {
              // Ignore errors, keep at 0
              setCurrentTime(0)
            }
          } else {
            // Replayer not ready yet, keep at 0
            setCurrentTime(0)
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
              console.log(`✅ Styled ${iframeIndicators.length} touch/mouse indicators in iframe`)
            }
          } catch (e) {
            console.warn('Error styling touch indicators:', e)
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
              console.log('✅ Injected touch indicator styles into iframe')
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
                console.log('✅ Watching iframe for touch indicators')
                
                // Store observer for cleanup
                return () => {
                  observer.disconnect()
                }
              }
            } catch (e) {
              // Can't observe iframe - might be sandboxed
              console.warn('Cannot watch iframe (may be sandboxed):', e)
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
                    console.log('🎨 Applied custom blue circle styling to touch indicator')
                  }
                  
                  console.log(`🎯 Indicator FULL debug:`, {
                    inlineStyles: {
                      position: el.style.position,
                      zIndex: el.style.zIndex,
                      visibility: el.style.visibility,
                      opacity: el.style.opacity,
                      display: el.style.display,
                      left: el.style.left,
                      top: el.style.top,
                      width: el.style.width,
                      height: el.style.height,
                      backgroundImage: el.style.backgroundImage?.substring(0, 50),
                    },
                    computedStyles: {
                      display: computed.display,
                      visibility: computed.visibility,
                      opacity: computed.opacity,
                      zIndex: computed.zIndex,
                      position: computed.position,
                      left: computed.left,
                      top: computed.top,
                      width: computed.width,
                      height: computed.height,
                      backgroundImage: computed.backgroundImage?.substring(0, 50) || 'none',
                      backgroundSize: computed.backgroundSize,
                    },
                    elementMetrics: {
                      offsetLeft: el.offsetLeft,
                      offsetTop: el.offsetTop,
                      offsetWidth: el.offsetWidth,
                      offsetHeight: el.offsetHeight,
                      clientWidth: el.clientWidth,
                      clientHeight: el.clientHeight,
                      scrollWidth: el.scrollWidth,
                      scrollHeight: el.scrollHeight,
                    },
                    parentInfo: {
                      tag: el.parentElement?.tagName,
                      className: el.parentElement?.className,
                      overflow: el.parentElement ? window.getComputedStyle(el.parentElement).overflow : 'N/A',
                      position: el.parentElement ? window.getComputedStyle(el.parentElement).position : 'N/A',
                      zIndex: el.parentElement ? window.getComputedStyle(el.parentElement).zIndex : 'N/A',
                    }
                  })
                })
                console.log(`✅ Styled ${wrapperIndicators.length} touch/mouse indicators in wrapper`)
              } else {
                console.log('⚠️ No touch/mouse indicators found in wrapper')
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
                console.log(`✅ Styled ${swipeLines.length} swipe/trail lines in wrapper`)
              } else {
                console.log('⚠️ No swipe/trail lines found in wrapper')
              }
            } else {
              console.log('⚠️ Wrapper not found')
            }
          } catch (e) {
            console.warn('Error checking wrapper indicators:', e)
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
      console.warn('⚠️ Replayer not ready yet')
      return
    }

    try {
      if (isPlaying) {
        console.log('⏸ Pausing...')
        replayerRef.current.pause()
      } else {
        console.log('▶ Playing...')
        replayerRef.current.play()
      }
    } catch (error) {
      console.error('Error in play/pause:', error)
    }
  }

  const handleSpeedChange = (speed: number) => {
    if (!replayerRef.current) return
    setPlaybackSpeed(speed)
    replayerRef.current.setConfig({ speed })
  }

  const handleSeek = (time: number) => {
    if (!replayerRef.current) return
    try {
      // Try different methods to seek
      if (replayerRef.current.goto) {
        replayerRef.current.goto(time)
      } else if (replayerRef.current.play) {
        // If goto doesn't exist, pause and play from start
        replayerRef.current.pause()
        // Note: rrweb doesn't have a direct goto, so we'd need to recreate
        // For now, just pause
      }
    } catch (e) {
      console.error('Error seeking:', e)
    }
  }

  return (
    <div className="flex flex-col h-full">
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
            style={{ borderWidth: '1px' }}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          {/* Speed Control */}
          <div className="flex items-center" style={{ gap: '8px' }}>
            <span className="text-sm" style={{ color: '#fafaf9', fontFamily: 'var(--font-inter)', fontWeight: 400 }}>Speed:</span>
            {[0.5, 1, 2].map((speed) => (
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

          {/* Timeline - ShadCN Slider with time display */}
          <div className="flex-1 flex items-center gap-3">
            {/* Start time */}
            <span className="text-sm min-w-[4rem] text-right font-mono tabular-nums" style={{ color: '#fafaf9', fontFamily: 'var(--font-inter)', fontWeight: 400 }}>
              {formatTime(currentTime)}
            </span>
            
            {/* Progress slider */}
            <Slider
              value={duration > 0 ? [currentTime / 1000] : [0]}
              min={0}
              max={duration > 0 ? duration / 1000 : 100}
              step={0.1}
              onValueChange={(value) => handleSeek(value[0] * 1000)}
              className="flex-1"
              disabled={duration === 0}
            />
            
            {/* End time */}
            <span className="text-sm min-w-[4rem] font-mono tabular-nums" style={{ color: '#fafaf9', fontFamily: 'var(--font-inter)', fontWeight: 400 }}>
              {formatTime(duration || 0)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

