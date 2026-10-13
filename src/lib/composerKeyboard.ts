export function shouldSubmitOnEnter(event: {
  key: string;
  isComposing?: boolean;
  keyCode?: number;
}) {
  // Some IMEs report compositionend before the Enter that confirms a candidate.
  return event.key === 'Enter' && !event.isComposing && event.keyCode !== 229;
}
