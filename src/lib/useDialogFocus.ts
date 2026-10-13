import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function useDialogFocus<T extends HTMLElement>(
  dialogRef: RefObject<T | null>,
  open: boolean,
  onDismiss: () => void,
) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const dialog: T | null = dialogRef.current;
    if (!open || !dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableElements = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
    const focusFirst = () => (focusableElements()[0] || dialog).focus();
    focusFirst();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        dismissRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusableElements();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) {
        event.preventDefault();
        dialog.focus();
      } else if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) focusFirst();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', handleFocus);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', handleFocus);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [dialogRef, open]);
}
