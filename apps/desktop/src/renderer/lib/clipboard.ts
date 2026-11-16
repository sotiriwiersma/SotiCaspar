/** Clipboard text with an in-memory fallback for contexts where the async clipboard API is unavailable. */
let memory = '';

export async function copyText(text: string): Promise<void> {
  memory = text;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // The in-memory copy still works inside the app.
  }
}

export async function pasteText(): Promise<string> {
  try {
    const text = await navigator.clipboard.readText();
    return text || memory;
  } catch {
    return memory;
  }
}
