import type { OscMessage } from '@soticaspar/core';
import { isControlPath } from './control-command';
import { noopLog, type LogFn } from './log';
import { MessageBatcher } from './message-batcher';
import { OscUdpReceiver } from './osc-udp-receiver';

const BATCH_INTERVAL_MS = 200;

interface MonitorEvent {
  sourceAddress: string;
  message: OscMessage;
}

/**
 * Receives the OSC stream of a CasparCG server. Only the newest message per source and path is delivered,
 * at most once every 200 ms. `/control` messages belong to the control server and are ignored.
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
