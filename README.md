# IconScout AutoTag Extension

Automates adding exactly 10 tags per card on the IconScout draft page. It uses bulk-only mode to click "Add all to Tags", processes cards in parallel batches, and provides a status overlay with Resume/Stop controls and runtime stats.

## Features
- Ensures every card ends with exactly `10` tags (never exceeds).
- Bulk-only tagging: uses "Add all to Tags"; no per-item clicks.
- Parallel processing with configurable concurrency.
- Status overlay: shows Running/Idle, total/done/failed/remaining, runtime, last message.
- Resume and Stop buttons to continue if halted.
- Preload suggested tags by smooth scrolling before processing.
- Trims excess tags immediately if a bulk click adds more than 10.

## Installation
1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked` and select this project folder.

## Usage
1. Open the IconScout draft page containing cards with suggested tags.
2. The extension detects the page, performs a preload scroll to load suggestions, then starts auto-tagging.
3. Use the overlay at bottom-right to view progress, or click `Stop`/`Resume` if needed.

## Configuration
Configuration object is defined near the top of `content.js`:
- `CONFIG.CONCURRENCY`: number of cards processed in parallel (default: `4`).
- `CONFIG.BULK_ONLY`: enforce bulk-only mode (default: `true`).
- `CONFIG.BULK_ATTEMPTS`: max attempts to click bulk add per card (default: `4`).

Notes:
- If tags exceed 10 in parallel mode, lower `CONFIG.CONCURRENCY` a bit.
- Background tabs may run slower due to browser timer throttling; keep the draft page open.

## Troubleshooting
- If a card sticks below 10 tags, ensure suggested tags load. The preload scroll helps; you can increase its duration.
- If tag count exceeds 10, safeguards trim to 10 immediately and prevent extra bulk clicks when already at 10.
- If the overlay does not appear, reload the extension and refresh the page.

## Development
- Key logic in `content.js`:
  - `autoTagAllCards()`: batches and parallelizes processing using `Promise.all`.
  - `autoTagCard(card)`: bulk-add tags with bounds checks and trimming.
  - `preloadSuggestedByScrolling()`: smooth scrolling to load suggestions before processing.
  - Status overlay helpers: `ensureStatusOverlay()`, `updateStatusOverlay()`.