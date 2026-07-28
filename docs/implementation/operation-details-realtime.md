# Operation details realtime synchronization

## Goal

Keep the operation details screen synchronized while Gemini is still analyzing the uploaded financial notice, without requiring the verifier to reload the page.

## Design

- `open_operation_access` remains the only source used to hydrate the screen.
- Supabase Realtime listens only for `UPDATE` events on the current `operations.id` and acts as a refresh signal.
- A six-second polling fallback runs only while analysis is pending.
- The screen refreshes when the document becomes visible again or the window regains focus.
- Concurrent refreshes are coalesced and subscriptions, timers, and listeners are cleaned up on unmount.
- Realtime payload data is not rendered directly, preserving the access-control contract and normalized RPC response.

## Pending analysis states

`pending`, `queued`, `processing`, `running`, `analyzing`, `uploaded`, and `received`.

## User experience

While analysis is pending, the details screen explains that extracted data will appear automatically and shows whether live updates or the fallback synchronization path is active.
