import { config } from './config'
import pako from 'pako'

/**
 * Types for PostHog API responses
 */
interface Source {
    source: string
    blob_key?: string
    start_blob_key?: string
    end_blob_key?: string
}

interface SourcesResponse {
    sources: Source[]
}

/**
 * Fetches the list of sources (blob storage locations) for a session recording
 */
async function fetchSources(): Promise<SourcesResponse> {
    const url = `${config.apiHost}/api/projects/${config.projectId}/session_recordings/${config.sessionId}/snapshots?blob_v2=true`

    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${config.apiKey}`
        }
    })

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error details')
        throw new Error(`Failed to fetch sources: ${response.status} ${response.statusText}. Details: ${errorText}`)
    }

    return await response.json()
}

/**
 * Fetches snapshot data from a specific source
 */
async function fetchSnapshotFromSource(source: Source): Promise<any> {
    const sourceParam = encodeURIComponent(source.source)

    let url: string

    if (source.source === 'blob_v2' || source.start_blob_key !== undefined) {
        const startKey = source.start_blob_key || source.blob_key
        const endKey = source.end_blob_key || source.blob_key

        if (!startKey || !endKey) {
            throw new Error(`Missing blob keys for source ${source.source}`)
        }

        const startKeyParam = encodeURIComponent(startKey)
        const endKeyParam = encodeURIComponent(endKey)
        url = `${config.apiHost}/api/projects/${config.projectId}/session_recordings/${config.sessionId}/snapshots?source=${sourceParam}&start_blob_key=${startKeyParam}&end_blob_key=${endKeyParam}&blob_v2=true`
    } else {
        const blobKeyParam = encodeURIComponent(source.blob_key || '')
        url = `${config.apiHost}/api/projects/${config.projectId}/session_recordings/${config.sessionId}/snapshots?source=${sourceParam}&blob_key=${blobKeyParam}`
    }

    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${config.apiKey}`
        }
    })

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error details')
        throw new Error(`Failed to fetch snapshot from source ${source.source}: ${response.status} ${response.statusText}`)
    }

    const text = await response.text()

    try {
        return JSON.parse(text)
    } catch (e) {
        // Try NDJSON format
        const lines = text.split('\n').filter(line => line.trim().length > 0)
        const parsed: any[] = []

        for (const line of lines) {
            try {
                parsed.push(JSON.parse(line))
            } catch (lineError) {
                console.warn('Failed to parse line:', line.substring(0, 100))
            }
        }

        if (parsed.length > 0) {
            return parsed
        }

        throw new Error(`Failed to parse response as JSON`)
    }
}

/**
 * Decompresses a compressed mutation field using pako
 */
function decompressField(compressed: string): any[] {
    try {
        const compressedArray = new Uint8Array(compressed.length)
        for (let i = 0; i < compressed.length; i++) {
            compressedArray[i] = compressed.charCodeAt(i) & 0xFF
        }
        const decompressed = pako.inflate(compressedArray, { to: 'string' })
        const parsed = JSON.parse(decompressed)
        return Array.isArray(parsed) ? parsed : []
    } catch (e) {
        console.error('Failed to decompress field:', e)
        return []
    }
}

/**
 * Checks if a string is compressed (gzip format)
 */
function isCompressed(str: string): boolean {
    return str.length > 1 && str.charCodeAt(0) === 0x1F && str.charCodeAt(1) === 0x8B
}

/**
 * Processes and decompresses mutation events (type 3)
 */
function processMutationEvent(event: any): any {
    if (event.type !== 3 || !event.data) {
        return event
    }

    const processed = { ...event, data: { ...event.data } }

    // Decompress removes, adds, texts, attributes if they're compressed strings
    const fields = ['removes', 'adds', 'texts', 'attributes'] as const
    
    for (const field of fields) {
        if (processed.data[field] && typeof processed.data[field] === 'string') {
            if (isCompressed(processed.data[field])) {
                processed.data[field] = decompressField(processed.data[field])
            } else {
                // Try parsing as JSON
                try {
                    processed.data[field] = JSON.parse(processed.data[field])
                } catch {
                    // Leave as-is if parsing fails
                }
            }
        }
        
        // Ensure it's an array
        if (!Array.isArray(processed.data[field])) {
            processed.data[field] = []
        }
    }

    return processed
}

/**
 * Fetches all session recording data and processes it for rrweb
 */
export async function fetchSessionData(): Promise<any[]> {
    const sourcesResponse = await fetchSources()
    
    if (!sourcesResponse.sources || sourcesResponse.sources.length === 0) {
        throw new Error('No sources found for this session recording')
    }

    const snapshotData: any[] = []

    // Fetch data from each source
    for (const source of sourcesResponse.sources) {
        const data = await fetchSnapshotFromSource(source)

        if (Array.isArray(data)) {
            snapshotData.push(...data)
        } else if (data && typeof data === 'object') {
            if (Array.isArray(data.events)) {
                snapshotData.push(...data.events)
            } else if (Array.isArray(data.data)) {
                snapshotData.push(...data.data)
            } else {
                snapshotData.push(data)
            }
        } else {
            snapshotData.push(data)
        }
    }
    
    // CRITICAL: Events come as tuples [sessionId, eventObject]
    // Extract the actual event objects from index [1] - optimized batch processing
    const extractedEvents: any[] = []
    for (let i = 0; i < snapshotData.length; i++) {
        const item = snapshotData[i]
        if (!item) continue
        
        if (Array.isArray(item) && item.length >= 2) {
            // It's a tuple [sessionId, eventObject]
            const eventObject = item[1]
            if (eventObject && typeof eventObject === 'object' && 'type' in eventObject) {
                extractedEvents.push(eventObject)
            }
        } else if (item && typeof item === 'object' && 'type' in item) {
            // Already an event object
            extractedEvents.push(item)
        }
    }
    
    // Check for FullSnapshot - log error if missing
    const fullSnapshot = extractedEvents.find((e: any) => {
        if (!e) return false
        const type = e.type
        return type === 2 || type === '2' || type === 2.0 || String(type) === '2'
    })
    
    if (!fullSnapshot) {
        const allTypes = extractedEvents.map((e: any) => e?.type).filter(t => t !== undefined)
        console.error('No FullSnapshot found in extracted events. Event types found:', [...new Set(allTypes)])
    }

    // Process events: remove PostHog-specific properties and decompress mutations
    // Use for loop instead of map for better performance
    const processedEvents: any[] = []
    
    for (let i = 0; i < extractedEvents.length; i++) {
        const event = extractedEvents[i]
        
        if (!event || typeof event !== 'object') {
            processedEvents.push(event)
            continue
        }

        // Remove PostHog-specific properties (shallow copy for performance)
        const cleaned: any = { ...event }
        delete cleaned.cv
        delete cleaned.delay

        // Process mutation events (type 3) - decompress compressed fields
        if (cleaned.type === 3 || cleaned.type === '3') {
            processedEvents.push(processMutationEvent(cleaned))
            continue
        }
        
        // Process FullSnapshot (type 2) - decompress if data is compressed
        if ((cleaned.type === 2 || cleaned.type === '2') && cleaned.data) {
            if (typeof cleaned.data === 'string' && isCompressed(cleaned.data)) {
                try {
                    // FullSnapshot data decompression - returns an object, not array
                    const compressedArray = new Uint8Array(cleaned.data.length)
                    for (let j = 0; j < cleaned.data.length; j++) {
                        compressedArray[j] = cleaned.data.charCodeAt(j) & 0xFF
                    }
                    const decompressed = pako.inflate(compressedArray, { to: 'string' })
                    const parsed = JSON.parse(decompressed)
                    if (parsed && typeof parsed === 'object') {
                        cleaned.data = parsed
                    }
                } catch (e) {
                    console.error('Failed to decompress FullSnapshot:', e)
                }
            }
        }

        processedEvents.push(cleaned)
    }
    
    // Final check for FullSnapshot - log error if missing
    const finalFullSnapshot = processedEvents.find((e: any) => e?.type === 2 || e?.type === '2')
    if (!finalFullSnapshot) {
        console.error('No FullSnapshot in processed events. Event types:', [...new Set(processedEvents.map((e: any) => e?.type))])
    }
    
    return processedEvents
}


