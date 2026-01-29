# Converlytik Session Replay Player

A Next.js-based session replay player for PostHog recordings, built with TypeScript and Tailwind CSS.

## Features

- ✅ **Full-featured playback controls**: Play/pause, speed control (0.5x, 1x, 2x, 4x), and timeline scrubbing
- ✅ **Original device dimensions**: Displays recordings at their original device size (mobile/desktop)
- ✅ **Touch indicators**: Shows touch and swipe gestures from mobile recordings
- ✅ **CSS sanitization**: Automatically handles malformed CSS in recordings
- ✅ **Mutation decompression**: Properly decompresses PostHog's compressed mutation events
- ✅ **Responsive design**: Scales recordings to fit the container while maintaining aspect ratio

## Tech Stack

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **rrweb** - Session replay library
- **pako** - Gzip decompression for PostHog mutations

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure your PostHog credentials in `lib/config.ts`:
```typescript
export const config = {
    apiKey: 'your-posthog-api-key',
    projectId: 'your-project-id',
    sessionId: 'your-session-id',
    apiHost: 'https://us.posthog.com',
}
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
├── app/
│   ├── page.tsx          # Main page component
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Global styles and player CSS
├── components/
│   └── Player.tsx        # Main player component with controls
├── lib/
│   ├── api.ts            # PostHog API client and data processing
│   └── config.ts         # Configuration file
└── README.md
```

## Key Implementation Details

### CSS Sanitization
The player automatically sanitizes CSS in FullSnapshot events to prevent parsing errors. Style elements and inline styles are removed while preserving the DOM structure.

### Device Dimensions
The player preserves the original device dimensions from the recording's viewport event (type 4), ensuring mobile recordings display correctly on desktop screens.

### Mutation Decompression
PostHog compresses mutation events (type 3) using gzip. The player automatically detects and decompresses these fields (`removes`, `adds`, `texts`, `attributes`) using the `pako` library.

### Player Sizing
The player uses CSS transforms to scale the recording wrapper to fit the container while maintaining the original aspect ratio. The iframe is sized to match the original device dimensions.

## Development

The project uses:
- **Next.js Turbopack** for fast development builds
- **ESLint** for code quality
- **TypeScript** for type safety

## Production Build

```bash
npm run build
npm start
```

## Notes

- This is a standalone prototype designed to be integrated into your main Next.js application
- The player handles edge cases like nested tree formats, compressed data, and malformed CSS
- All PostHog-specific properties (`cv`, `delay`) are removed during processing
