declare module '@cycjimmy/jsmpeg-player' {
  export interface PlayerOptions {
    canvas?: HTMLCanvasElement;
    audio?: boolean;
    video?: boolean;
    /** Seconds between reconnect attempts of the WebSocket source; 0 disables reconnecting. */
    reconnectInterval?: number;
    pauseWhenHidden?: boolean;
    disableGl?: boolean;
    videoBufferSize?: number;
    audioBufferSize?: number;
    onVideoDecode?: () => void;
    onSourceEstablished?: () => void;
  }

  export class Player {
    constructor(url: string, options?: PlayerOptions);
    volume: number;
    destroy(): void;
  }

  const JSMpeg: { Player: typeof Player };
  export default JSMpeg;
}
