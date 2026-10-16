/** Keep the drag cursor and the eventual file operation in sync. */
export function getFileDropEffect(event: {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey?: boolean;
}): 'copy' | 'move' {
  // An explicit copy modifier wins when several modifiers are pressed.
  return event.shiftKey && !event.ctrlKey && !event.metaKey ? 'move' : 'copy';
}
