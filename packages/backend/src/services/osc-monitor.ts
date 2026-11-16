import type { OscMessage } from '@soticaspar/core';
import { isControlPath } from './control-command';
import { noopLog, type LogFn } from './log';
import { MessageBatcher } from './message-batcher';
import { OscUdpReceiver } from './osc-udp-receiver';

/**
 * Short enough to pass on every frame (the server sends one bundle per frame: 20 ms at 50 fps, 16.7 ms at 60 fps),
 * long enough to merge repeats within a burst. It was 200 ms, which showed the time only every 10 frames at 50 fps.
 */
const BATCH_INTERVAL_MS = 10;

interface MonitorEvent {
  sourceAddress: string;
  message: OscMessage;
}

/**
 * Receives the OSC stream of a CasparCG server. Only the newest message per source and path is delivered,
 * at most once every 10 ms. `/control` messages belong to the control server and are ignored.
 */
export class OscMonitor {
  private readonly receiver: OscUdpReceiver;
  private readonly batcher: MessageBatcher<MonitorEvent>;

  constructor(
    private readonly port: number,
    onMessage: (sourceAddress: string, message: OscMessage) => void,
    private readonly log: LogFn = noopLog
  ) {
    this.batcher = new MessageBatcher(BATCH_INTERVAL_MS, 'latest', (events) =>
      events.forEach((event) => onMessage(event.sourceAddress, event.message))
    );
    this.receiver = new OscUdpReceiver(
      port,
      (sourceAddress, message) => {
        if (!isControlPath(message.path)) this.batcher.add(sourceAddress + message.path, { sourceAddress, message });
      },
      log
    );
  }

  async start(): Promise<void> {
    await this.receiver.start();
    this.batcher.start();
    this.log('info', `Listening for OSC monitor messages over UDP on port ${this.port}`);
  }

  async stop(): Promise<void> {
    this.batcher.stop();
    await this.receiver.stop();
  }
}
