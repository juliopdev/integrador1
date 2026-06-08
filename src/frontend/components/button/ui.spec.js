import { describe, it, expect, vi } from 'vitest';
import UIButtonComponent from './ui.js';
import InMemoryEventBus from '../../scripts/event-bus/in-memory.js';

describe('UIButtonComponent Lifecycle Tests', () => {
  it('should trigger events on click after mount', () => {
    // Mocking DOM elements
    const element = {
      id: 'test-btn',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const bus = new InMemoryEventBus();
    const onClickMock = vi.fn();

    const btn = new UIButtonComponent(element, bus, { onClick: onClickMock });
    btn.mount();

    expect(element.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));

    // Simulate click event manually
    const clickHandler = element.addEventListener.mock.calls[0][1];
    const eventMock = { target: element };
    
    const busListener = vi.fn();
    bus.on('ui:button:click', busListener);

    clickHandler(eventMock);

    expect(onClickMock).toHaveBeenCalledWith(eventMock);
    expect(busListener).toHaveBeenCalledWith({ id: 'test-btn', element, event: eventMock });
  });

  it('should clean up listeners on destroy', () => {
    const element = {
      id: 'test-btn',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const bus = new InMemoryEventBus();

    const btn = new UIButtonComponent(element, bus);
    btn.mount();
    btn.destroy();

    expect(element.removeEventListener).toHaveBeenCalledWith('click', expect.any(Function));
  });
});
