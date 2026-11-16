import type { ControlCommand } from '@soticaspar/core';
import { isControlPath, parseControlCommand } from './control-command';
import { noopLog, type LogFn } from './log';
import { MessageBatcher } from './message-batcher';
import { OscUdpReceiver } from './osc-udp-receiver';

const BATCH_INTERVAL_MS = 400;

/**
 * Receives `/control/...` OSC messages over UDP. Commands are delivered in batches every 400 ms; a repeated
 * command from the same source within one batch is dropped so a retriggering sender cannot queue duplicates.
 */
export class OscControlServer {
  private readonly receiver: OscUdpReceiver;
  private readonly batcher: MessageBatcher<ControlCommand>;

  constructor(
    private readonly port: number,
    onCommand: (cmd: ControlCommand) => void,
    private readonly log: LogFn = noopLog
  ) {
    this.batcher = new MessageBatcher(BATCH_INTERVAL_MS, 'first', (commands) => commands.forEach(onCommand));
    this.receiver = new OscUdpReceiver(
      port,
      (sourceAddress, message) => {
        if (!isControlPath(message.path)) return;
        const command = parseControlCommand(message.path, message.args);
        if (!command) {
          this.log('debug', `Ignoring unknown OSC control message ${message.path} from ${sourceAddress}`);
          return;
        }
        this.log('debug', `Received OSC control message over UDP from ${sourceAddress}: ${message.path}`);
        this.batcher.add(sourceAddress + message.path, command);
      },
      log
    );
  }

  async start(): Promise<void> {
    await this.receiver.start();
    this.batcher.start();
    this.log('info', `Listening for OSC control messages over UDP on port ${this.port}`);
  }

  async stop(): Promise<void> {
    this.batcher.stop();
    await this.receiver.stop();
  }
}
