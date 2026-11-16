export type DialogName = 'settings' | 'about' | 'openUrl' | 'help';

export interface ConfirmRequest {
  title: string;
  message: string;
  /** Labels of the buttons, the first is the default. Resolves with the clicked label's index. */
  buttons: string[];
}

export interface PromptRequest {
  title: string;
  label: string;
  value?: string;
  okLabel?: string;
  /** Returns an error text for invalid input. */
  validate?: (value: string) => string | null;
}

interface Pending<T, R> {
  request: T;
  resolve: (value: R) => void;
}

/** Dialog, toast and status bar state. */
class UiState {
  dialog = $state<DialogName | null>(null);
  confirmRequest = $state.raw<Pending<ConfirmRequest, number> | null>(null);
  promptRequest = $state.raw<Pending<PromptRequest, string | null> | null>(null);
  status = $state('');
  toast = $state<{ text: string; error: boolean } | null>(null);

  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  open(dialog: DialogName): void {
    this.dialog = dialog;
  }

  close(): void {
    this.dialog = null;
  }

  confirm(request: ConfirmRequest): Promise<number> {
    return new Promise((resolve) => {
      this.confirmRequest = { request, resolve };
    });
  }

  answerConfirm(index: number): void {
    this.confirmRequest?.resolve(index);
    this.confirmRequest = null;
  }

  prompt(request: PromptRequest): Promise<string | null> {
    return new Promise((resolve) => {
      this.promptRequest = { request, resolve };
    });
  }

  answerPrompt(value: string | null): void {
    this.promptRequest?.resolve(value);
    this.promptRequest = null;
  }

  notify(text: string, error = false): void {
    this.toast = { text, error };
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), error ? 6000 : 3000);
  }
}

export const ui = new UiState();
