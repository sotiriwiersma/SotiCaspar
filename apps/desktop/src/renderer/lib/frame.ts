/** Runs `run` at most once per animation frame, however often `schedule` is called. */
export function frameBatcher(run: () => void): { schedule(): void; cancel(): void } {
  let handle: number | undefined;
  const request = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: () => void) => setTimeout(cb, 16) as unknown as number;
  const abort = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : (id: number) => clearTimeout(id);

  return {
    schedule() {
      if (handle !== undefined) return;
      handle = request(() => {
        handle = undefined;
        run();
      });
    },
    cancel() {
      if (handle !== undefined) abort(handle);
      handle = undefined;
    }
  };
}
