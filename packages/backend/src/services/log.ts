export type LogFn = (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;

export const noopLog: LogFn = () => {};
