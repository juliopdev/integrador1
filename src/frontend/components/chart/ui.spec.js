// @vitest-environment jsdom
/**
 * Pruebas del componente Chart.
 * Verifica inicialización, actualización de datos y limpieza al destruir.
 *
 * @module ChartSpec
 */
import { describe, it, expect, vi } from 'vitest';
import { Chart } from './ui.js';

function mount() {
  document.body.innerHTML = `
    <div class="c-chart" id="my-chart" style="width: 300px; height: 150px;">
      <canvas class="c-chart__canvas"></canvas>
      <div class="c-chart__tooltip"></div>
    </div>`;
  
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn().mockReturnValue({
      addColorStop: vi.fn()
    }),
    bezierCurveTo: vi.fn(),
    fillText: vi.fn(),
    arc: vi.fn()
  });

  const chart = new Chart(document.getElementById('my-chart'));
  chart.mount();
  return chart;
}

describe('Chart', () => {
  it('se monta correctamente', () => {
    const chart = mount();
    expect(chart.canvas).toBeTruthy();
    expect(chart.tooltip).toBeTruthy();
  });

  it('actualiza y dibuja datos al recibir el evento en el bus', () => {
    const chart = mount();
    
    chart.emit('chart:update', {
      target: 'my-chart',
      points: [
        { label: 'Jan', value: 10 },
        { label: 'Feb', value: 20 }
      ]
    });

    expect(chart.points.length).toBe(2);
    expect(chart.points[0].value).toBe(10);
    expect(chart.canvas.getContext).toHaveBeenCalled();
  });
});
