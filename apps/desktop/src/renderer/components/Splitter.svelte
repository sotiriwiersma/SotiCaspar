<script lang="ts">
  interface Props {
    /** Current width of the panel this handle resizes, in px. */
    size: number;
    onresize: (size: number) => void;
    /** `1` when the panel is left of the handle (dragging right grows it), `-1` when it is right of it. */
    direction: 1 | -1;
    label: string;
    min?: number;
    max?: number;
  }

  let { size, onresize, direction, label, min = 180, max = 700 }: Props = $props();

  const clamp = (value: number): number => Math.min(max, Math.max(min, value));

  let dragging = $state(false);

  /**
   * A drag ends on every way the pointer can go: release, cancel (touch, Alt+Tab, a system dialog) and lost capture
   * (the window losing focus mid-drag). Ending only on `pointerup` left the handle stuck to the mouse when the
   * release happened outside the window or the capture was taken away.
   */
  function onpointerdown(event: PointerEvent): void {
    if (event.button !== 0 || dragging) return;
    event.preventDefault();
    const startX = event.clientX;
    const startSize = size;
    const target = event.currentTarget as HTMLElement;
    const pointerId = event.pointerId;
    target.setPointerCapture(pointerId);
    dragging = true;
    // Keep the resize cursor and stop text selection everywhere while dragging, also over other panels.
    document.body.classList.add('col-resizing');

    let frame = 0;
    let lastX = startX;
    const move = (e: PointerEvent): void => {
      if (e.pointerId !== pointerId) return;
      // A release that the window never saw: the button is no longer down, so stop here.
      if ((e.buttons & 1) === 0) return end();
      lastX = e.clientX;
      if (frame === 0) frame = requestAnimationFrame(() => {
        frame = 0;
        onresize(clamp(startSize + direction * (lastX - startX)));
      });
    };
    const end = (): void => {
      if (!dragging) return;
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      onresize(clamp(startSize + direction * (lastX - startX)));
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      target.removeEventListener('lostpointercapture', end);
      window.removeEventListener('blur', end);
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      document.body.classList.remove('col-resizing');
      dragging = false;
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    target.addEventListener('lostpointercapture', end);
    window.addEventListener('blur', end);
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    onresize(clamp(size + direction * (event.key === 'ArrowRight' ? 16 : -16)));
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="splitter" class:dragging role="separator" aria-orientation="vertical" aria-label={label} aria-valuenow={size} aria-valuemin={min} aria-valuemax={max} tabindex="0" {onpointerdown} {onkeydown}></div>

<style>
  .splitter {
    cursor: col-resize;
    background: var(--bg-darker);
    touch-action: none;
  }

  .splitter:hover,
  .splitter.dragging,
  .splitter:focus-visible {
    background: var(--accent);
    outline: none;
  }

  :global(body.col-resizing),
  :global(body.col-resizing *) {
    cursor: col-resize !important;
    user-select: none !important;
  }
</style>
