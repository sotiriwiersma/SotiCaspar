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

  function onpointerdown(event: PointerEvent): void {
    const startX = event.clientX;
    const startSize = size;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent): void => onresize(clamp(startSize + direction * (e.clientX - startX)));
    const up = (): void => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    onresize(clamp(size + direction * (event.key === 'ArrowRight' ? 16 : -16)));
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="splitter" role="separator" aria-orientation="vertical" aria-label={label} aria-valuenow={size} aria-valuemin={min} aria-valuemax={max} tabindex="0" {onpointerdown} {onkeydown}></div>

<style>
  .splitter {
    cursor: col-resize;
    background: var(--bg-darker);
    touch-action: none;
  }

  .splitter:hover,
  .splitter:focus-visible {
    background: var(--accent);
    outline: none;
  }
</style>
