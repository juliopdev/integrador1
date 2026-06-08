import { describe, it, expect, vi } from 'vitest';
import InMemoryEventBus from './in-memory.js';

describe('InMemoryEventBus Unit Tests', () => {
  it('should register and trigger an event successfully', () => {
    const bus = new InMemoryEventBus();
    const callback = vi.fn();

    bus.on('test-event', callback);
    bus.emit('test-event', { value: 123 });

    expect(callback).toHaveBeenCalledWith({ value: 123 });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should remove registered event handlers successfully', () => {
    const bus = new InMemoryEventBus();
    const callback = vi.fn();

    bus.on('test-event', callback);
    bus.off('test-event', callback);
    bus.emit('test-event', { value: 123 });

    expect(callback).not.toHaveBeenCalled();
  });

  it('should support global listeners using wildcards', () => {
    const bus = new InMemoryEventBus();
    const callback = vi.fn();

    bus.on('*', callback);
    bus.emit('another-event', 'hello');

    expect(callback).toHaveBeenCalledWith('another-event', 'hello');
  });
});
