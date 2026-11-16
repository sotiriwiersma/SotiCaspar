import { backend } from '../lib/backend';
import { OscMonitor } from '../engine/oscMonitor';

/** The one OSC subscription manager of the window. */
export const monitor = new OscMonitor(backend);
