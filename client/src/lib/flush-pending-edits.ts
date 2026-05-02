// Force-blur the currently-focused element so its onBlur handler fires
// before navigation/submission.
//
// Why this exists: macOS does not shift focus to a `<button>` (or anchor,
// in some browsers) on click. The page's currently-focused input therefore
// never receives a `blur` event, and any "commit on blur" handler attached
// to it is silently dropped — losing the user's most recent typed value
// when the navigation unmounts the input. F0.4.3 caught this in the deal
// wizard's Engagement Inputs (Tax & Admin fee was being lost when the user
// clicked "Pricing" without tabbing first).
//
// Usage: attach to `onMouseDown` on any element that navigates or unmounts
// inputs that commit-on-blur. mousedown precedes click in the React event
// order, so the active element's blur fires synchronously, the mutation
// kicks off, and the click-handler navigation runs with the request
// already in flight. React Query's onSuccess invalidates the cache and
// the next view re-renders with the persisted value.
//
// Safe in SSR (window/document checks) and in tests.

export function flushPendingEdits(): void {
  if (typeof document === "undefined") return;
  const active = document.activeElement as HTMLElement | null;
  if (active && typeof active.blur === "function") active.blur();
}
