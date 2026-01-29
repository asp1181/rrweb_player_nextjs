# Session Recording Player

A Next.js application that fetches, processes, and replays PostHog session recordings using the `rrweb` library.

## Overview

This project demonstrates how to:
1. Fetch compressed session recording data from PostHog's API
2. Process and decompress the data into rrweb-compatible event format
3. Initialize and control an rrweb Replayer to display the session recording

## Architecture

```
PostHog API → Fetch Sources → Fetch Snapshots → Process Events → rrweb Replayer
```

The application follows this flow:
- **API Layer** (`lib/api.ts`): Handles fetching and processing PostHog data
- **Player Component** (`components/Player.tsx`): Manages rrweb Replayer lifecycle
- **Configuration** (`lib/config.ts`): Stores PostHog API credentials and session ID

## How PostHog Stores Session Recordings

PostHog stores session recordings in a distributed blob storage system:

1. **Sources**: Each recording has one or more "sources" (blob storage locations)
2. **Blob Keys**: Each source has `start_blob_key` and `end_blob_key` that identify the data chunks
3. **Compressed Data**: Events are stored compressed using gzip (pako) to reduce storage size
4. **Tuple Format**: Events are returned as tuples `[sessionId, eventObject]` rather than raw event objects

## Data Fetching Process

### Step 1: Fetch Sources

First, we fetch the list of sources (blob storage locations) for a session:

```typescript
GET /api/projects/{projectId}/session_recordings/{sessionId}/snapshots?blob_v2=true
```

Response contains an array of sources with blob keys:
```json
{
  "sources": [
    {
      "source": "blob_v2",
      "start_blob_key": "abc123...",
      "end_blob_key": "xyz789..."
    }
  ]
}
```

### Step 2: Fetch Snapshot Data from Each Source

For each source, we fetch the actual snapshot data:

```typescript
GET /api/projects/{projectId}/session_recordings/{sessionId}/snapshots?
  source=blob_v2&
  start_blob_key={startKey}&
  end_blob_key={endKey}&
  blob_v2=true
```

The response can be:
- **JSON**: Single JSON object or array
- **NDJSON**: Newline-delimited JSON (one event per line)

We handle both formats by attempting JSON parse first, then falling back to NDJSON parsing.

## Data Processing

### Step 1: Extract Event Objects from Tuples

**Critical Discovery**: PostHog returns events as tuples `[sessionId, eventObject]`, not raw event objects.

```typescript
// PostHog returns:
[
  ["session-id-123", { type: 4, timestamp: 1234567890, data: {...} }],
  ["session-id-123", { type: 2, timestamp: 1234567891, data: {...} }],
  ...
]

// We need to extract:
[
  { type: 4, timestamp: 1234567890, data: {...} },
  { type: 2, timestamp: 1234567891, data: {...} },
  ...
]
```

We iterate through the snapshot data and extract `item[1]` (the event object) from each tuple.

### Step 2: Remove PostHog-Specific Properties

PostHog adds metadata properties that rrweb doesn't understand:
- `cv`: PostHog-specific property
- `delay`: PostHog-specific property

We create a shallow copy of each event and delete these properties.

### Step 3: Decompress Compressed Fields

PostHog compresses certain event data using gzip (pako). We detect and decompress:

#### Mutation Events (Type 3)

Mutation events contain compressed arrays in fields:
- `removes`: Array of removed nodes
- `adds`: Array of added nodes  
- `texts`: Array of text changes
- `attributes`: Array of attribute changes

**Compression Detection**: Check if a field is a string starting with `0x1F 0x8B` (gzip magic bytes).

**Decompression Process**:
1. Convert string to `Uint8Array`
2. Use `pako.inflate()` to decompress
3. Parse decompressed JSON string
4. Ensure result is an array

```typescript
function decompressField(compressed: string): any[] {
  const compressedArray = new Uint8Array(compressed.length)
  for (let i = 0; i < compressed.length; i++) {
    compressedArray[i] = compressed.charCodeAt(i) & 0xFF
  }
  const decompressed = pako.inflate(compressedArray, { to: 'string' })
  const parsed = JSON.parse(decompressed)
  return Array.isArray(parsed) ? parsed : []
}
```

#### FullSnapshot Events (Type 2)

FullSnapshot events contain the initial DOM state. The `data` field may be compressed:

```typescript
if (typeof cleaned.data === 'string' && isCompressed(cleaned.data)) {
  // Decompress FullSnapshot data
  const compressedArray = new Uint8Array(cleaned.data.length)
  // ... convert to Uint8Array
  const decompressed = pako.inflate(compressedArray, { to: 'string' })
  const parsed = JSON.parse(decompressed)
  // FullSnapshot data is an object, not an array
  cleaned.data = parsed
}
```

**Important**: FullSnapshot `data` decompresses to an **object**, not an array (unlike mutation events).

### Step 4: Validate FullSnapshot

rrweb requires at least one FullSnapshot event (type 2) to initialize. We validate this exists:

```typescript
const fullSnapshot = processedEvents.find((e: any) => e?.type === 2 || e?.type === '2')
if (!fullSnapshot) {
  console.error('No FullSnapshot found in processed events')
  // Cannot proceed without FullSnapshot
}
```

## rrweb Replayer Integration

### Event Types

rrweb uses these event types:
- **Type 2**: FullSnapshot - Initial DOM state
- **Type 3**: IncrementalSnapshot - DOM mutations (adds, removes, text changes, attributes)
- **Type 4**: Meta - Viewport dimensions, URL changes
- **Type 5**: Custom - Custom events

### Initializing the Replayer

```typescript
import { Replayer } from 'rrweb'

const replayer = new Replayer(processedEvents, {
  root: containerElement,      // DOM container for the player
  liveMode: false,            // Not live playback
  speed: 1,                   // Playback speed
  mouseTail: true,            // Show mouse trail
})
```

### How rrweb Works

1. **Creates an iframe**: rrweb creates an `<iframe>` inside your container
2. **Renders DOM**: The iframe contains a recreated version of the recorded page
3. **Replays events**: Events are replayed in chronological order, reconstructing the DOM state
4. **Touch/Mouse indicators**: rrweb creates `.replayer-mouse` elements for touch/mouse events

### Performance Considerations

- **Deferred initialization**: Use `setTimeout` and `requestAnimationFrame` to defer heavy work
- **Minimal processing**: Let rrweb handle event sorting and DOM reconstruction
- **Cleanup**: Properly clean up intervals, event listeners, and replayer instances

## Key Technical Challenges Solved

### 1. Tuple Format Discovery

**Problem**: Events weren't being recognized as valid rrweb events.

**Solution**: Discovered PostHog returns events as tuples `[sessionId, eventObject]`. Extract `item[1]` before processing.

### 2. Compression Detection

**Problem**: Compressed fields appeared as strings, causing parsing errors.

**Solution**: Check for gzip magic bytes (`0x1F 0x8B`) to detect compression before attempting decompression.

### 3. FullSnapshot vs Mutation Decompression

**Problem**: FullSnapshot `data` decompresses to an object, while mutation fields decompress to arrays.

**Solution**: Handle each case separately - FullSnapshot gets object assignment, mutations get array assignment.

### 4. Multiple Sources

**Problem**: A session recording can span multiple blob sources.

**Solution**: Fetch from all sources and merge the results into a single events array.

### 5. NDJSON Format

**Problem**: Some sources return NDJSON (newline-delimited JSON) instead of regular JSON.

**Solution**: Attempt JSON parse first, then fall back to NDJSON parsing line-by-line.

## Dependencies

- **rrweb**: Core replay library (`^2.0.0-alpha.4`)
- **pako**: Gzip decompression (`^2.1.0`)
- **next**: Next.js framework (`16.1.6`)
- **react**: React library (`19.2.3`)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure PostHog credentials in `lib/config.ts`:
```typescript
export const config = {
  apiKey: 'your-posthog-api-key',
  projectId: 'your-project-id',
  sessionId: 'session-recording-id',
  apiHost: 'https://us.posthog.com',
}
```

3. Run development server:
```bash
npm run dev
```

## File Structure

```
lib/
  api.ts          # PostHog API fetching and data processing
  config.ts       # PostHog API configuration
components/
  Player.tsx      # rrweb Replayer component
app/
  page.tsx        # Main page component
```

## API Reference

### `fetchSessionData(): Promise<any[]>`

Fetches and processes session recording data from PostHog.

**Returns**: Array of processed rrweb-compatible events

**Process**:
1. Fetches sources from PostHog API
2. Fetches snapshot data from each source
3. Extracts event objects from tuples
4. Removes PostHog-specific properties
5. Decompresses compressed fields
6. Validates FullSnapshot exists
7. Returns processed events array

### `processMutationEvent(event: any): any`

Processes and decompresses mutation events (type 3).

**Parameters**:
- `event`: Raw mutation event

**Returns**: Processed mutation event with decompressed arrays

### `decompressField(compressed: string): any[]`

Decompresses a gzip-compressed string field.

**Parameters**:
- `compressed`: Compressed string (gzip format)

**Returns**: Decompressed array

## Future Considerations

### Database Storage

Instead of fetching from PostHog API on-demand, you could:
1. Proactively fetch recordings when they're created
2. Process and decompress the data
3. Store the processed events array in your database
4. Fetch from your database when displaying

**Benefits**:
- Faster loading times
- Reduced PostHog API calls
- Better control over data retention

**Storage Format**: Store the processed events array as JSON in your database. The format is the same as what you pass to `rrweb.Replayer()`.

## Resources

- [rrweb Documentation](https://github.com/rrweb-io/rrweb)
- [PostHog Session Recordings API](https://posthog.com/docs/api/session-recordings)
- [pako (gzip) Library](https://github.com/nodeca/pako)
