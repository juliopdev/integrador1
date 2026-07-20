import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * Chart: Graficador vectorial interactivo responsivo en Canvas HTML5 sin dependencias.
 * Soporta gráficos de tipo área, barras y dona con hover tooltip.
 * @module chart.ui
 * @extends {UIComponentContract}
 */
export class Chart extends UIComponentContract {
  /**
   * Inicializa el canvas, tooltip, tabs de tipo de gráfico, y registra listeners de eventos
   * del bus (`chart:update`), resize y mouse.
   * @override
   */
  onMount() {
    this.canvas = this.element.querySelector('.c-chart__canvas');
    this.tooltip = this.element.querySelector('.c-chart__tooltip');
    
    if (!this.canvas || !this.tooltip) return;

    this.ctx = this.canvas.getContext('2d');
    this.points = [];
    this.scaleRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.chartType = this.element.dataset.type || 'area';

    // Manejo de clicks en pestañas
    this.tabs = this.element.querySelectorAll('[data-chart-type]');
    this._onTabClick = (e) => {
      const type = e.currentTarget.dataset.chartType;
      this.setChartType(type);
    };
    this.tabs.forEach(tab => tab.addEventListener('click', this._onTabClick));

    this._onUpdate = (payload) => {
      if (payload?.target === this.element.id) {
        this.setData(payload.points);
      }
    };

    this._onResize = () => {
      this.resize();
    };

    this._onMouseMove = (e) => {
      this.handleMouseMove(e);
    };

    this._onMouseLeave = () => {
      this.handleMouseLeave();
    };

    this.on('chart:update', this._onUpdate);
    window.addEventListener('resize', this._onResize);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mouseleave', this._onMouseLeave);

    this.resize();
  }

  /**
   * Actualiza los datos del gráfico y redibuja.
   * @param {Array<{label: string, value: number}>} points - Arreglo de puntos etiquetados.
   */
  setData(points) {
    this.points = points || [];
    this.draw();
  }

  /**
   * Cambia el tipo de gráfico (area, bar, donut) y redibuja.
   * @param {'area'|'bar'|'donut'} type - Nuevo tipo de gráfico.
   */
  setChartType(type) {
    this.chartType = type;
    this.element.setAttribute('data-type', type);
    this.tabs.forEach(tab => {
      tab.classList.toggle('c-chart__tab--active', tab.dataset.chartType === type);
    });
    this.draw();
  }

  /**
   * Redimensiona el canvas escalando por devicePixelRatio y redibuja.
   */
  resize() {
    if (!this.canvas) return;
    this.canvas.width = this.canvas.clientWidth * this.scaleRatio;
    this.canvas.height = this.canvas.clientHeight * this.scaleRatio;
    this.draw();
  }

  /**
   * Renderiza el gráfico completo en el canvas según `this.chartType` y los puntos actuales.
   * @param {number} [hoverIndex=-1] - Índice del punto en hover para resaltar (-1 = sin hover).
   */
  draw(hoverIndex = -1) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, width, height);

    if (this.points.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = `${12 * this.scaleRatio}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Sin datos de métricas', width / 2, height / 2);
      return;
    }

    const rootStyle = getComputedStyle(document.documentElement);
    const primaryColor = rootStyle.getPropertyValue('--color-primary-600').trim() || '#6366f1';
    const primaryLightColor = rootStyle.getPropertyValue('--color-primary-100').trim() || '#e0e7ff';
    const gridColor = rootStyle.getPropertyValue('--color-border').trim() || '#cbd5e1';
    const textMutedColor = rootStyle.getPropertyValue('--color-text-muted').trim() || '#64748b';

    // Dibuja el gráfico circular/donut
    if (this.chartType === 'donut') {
      const total = this.points.reduce((sum, p) => sum + (p.value || 0), 0);
      const centerX = width / 2;
      const centerY = height / 2;
      const outerRadius = Math.min(width, height) * 0.42;
      const innerRadius = outerRadius * 0.58;

      // Colores de los sectores del donut según la captura
      const warningColor = rootStyle.getPropertyValue('--color-warning').trim() || '#f59e0b';
      const successColor = rootStyle.getPropertyValue('--color-success').trim() || '#10b981';
      const segmentColors = [
        primaryColor,   // Direct
        warningColor,   // Email
        primaryLightColor, // Social
        successColor,   // Other
      ];

      let startAngle = -Math.PI / 2;

      this.points.forEach((pt, idx) => {
        const sliceAngle = ((pt.value || 0) / total) * Math.PI * 2;
        ctx.fillStyle = segmentColors[idx % segmentColors.length];
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, outerRadius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fill();
        startAngle += sliceAngle;
      });

      // Recorta el centro para hacer la dona (perfecto con transparencias/gradientes de fondo)
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      return;
    }

    // Gráfico de Area o Bar (tienen ejes cartesianos)
    const maxVal = Math.max(...this.points.map(p => p.value), 10);
    const minVal = 0;
    
    // Márgenes para las etiquetas de los ejes
    const paddingLeft = 45 * this.scaleRatio;
    const paddingRight = 15 * this.scaleRatio;
    const paddingTop = 20 * this.scaleRatio;
    const paddingBottom = 30 * this.scaleRatio;
    
    const graphWidth = width - paddingLeft - paddingRight;
    const graphHeight = height - paddingTop - paddingBottom;

    // Dibuja líneas de cuadrícula discontinuas/punteadas
    ctx.lineWidth = 1 * this.scaleRatio;
    ctx.strokeStyle = gridColor;
    if (ctx.setLineDash) ctx.setLineDash([4 * this.scaleRatio, 4 * this.scaleRatio]);
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const y = paddingTop + graphHeight * (i / 4);
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
    }
    ctx.stroke();
    if (ctx.setLineDash) ctx.setLineDash([]); // Reset line dash

    // Dibuja etiquetas en Y-axis
    ctx.fillStyle = textMutedColor;
    ctx.font = `${10 * this.scaleRatio}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const y = paddingTop + graphHeight * (i / 4);
      const val = Math.round(maxVal - (maxVal - minVal) * (i / 4));
      ctx.fillText(val.toString(), paddingLeft - 8 * this.scaleRatio, y);
    }

    // Calcula coordenadas de los puntos
    const stepX = graphWidth / (this.points.length - 1 || 1);
    const coords = this.points.map((p, idx) => {
      const x = paddingLeft + idx * stepX;
      const ratio = (p.value - minVal) / (maxVal - minVal);
      const y = paddingTop + graphHeight * (1 - ratio);
      return { x, y };
    });

    // Dibuja etiquetas en X-axis
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    coords.forEach((pt, idx) => {
      ctx.fillText(this.points[idx].label, pt.x, height - paddingBottom + 8 * this.scaleRatio);
    });

    // DIBUJA AREA CHART
    if (this.chartType === 'area') {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, primaryColor + '45');
      gradient.addColorStop(1, primaryColor + '00');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(coords[0].x, height - paddingBottom);
      
      // Bezier curve para la curva suave
      ctx.lineTo(coords[0].x, coords[0].y);
      for (let i = 1; i < coords.length; i++) {
        const prev = coords[i - 1];
        const curr = coords[i];
        const cpX1 = prev.x + (curr.x - prev.x) / 2;
        const cpY1 = prev.y;
        const cpX2 = prev.x + (curr.x - prev.x) / 2;
        const cpY2 = curr.y;
        ctx.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, curr.x, curr.y);
      }
      ctx.lineTo(coords[coords.length - 1].x, height - paddingBottom);
      ctx.closePath();
      ctx.fill();

      // Dibuja la línea de la curva
      ctx.lineWidth = 2.5 * this.scaleRatio;
      ctx.strokeStyle = primaryColor;
      ctx.beginPath();
      ctx.moveTo(coords[0].x, coords[0].y);
      for (let i = 1; i < coords.length; i++) {
        const prev = coords[i - 1];
        const curr = coords[i];
        const cpX1 = prev.x + (curr.x - prev.x) / 2;
        const cpY1 = prev.y;
        const cpX2 = prev.x + (curr.x - prev.x) / 2;
        const cpY2 = curr.y;
        ctx.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, curr.x, curr.y);
      }
      ctx.stroke();
    }

    // DIBUJA BAR CHART
    if (this.chartType === 'bar') {
      const barWidth = Math.max(8 * this.scaleRatio, (graphWidth / this.points.length) * 0.4);
      const hoverColor = rootStyle.getPropertyValue('--color-primary-700').trim() || '#4f46e5';
      
      coords.forEach((pt, idx) => {
        const barHeight = height - paddingBottom - pt.y;
        ctx.fillStyle = idx === hoverIndex ? hoverColor : primaryColor;
        
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(pt.x - barWidth / 2, pt.y, barWidth, barHeight, [4 * this.scaleRatio, 4 * this.scaleRatio, 0, 0]);
        } else {
          ctx.rect(pt.x - barWidth / 2, pt.y, barWidth, barHeight);
        }
        ctx.fill();
      });
    }

    // Indicador de hover para Area/Bar
    if (hoverIndex >= 0 && hoverIndex < coords.length) {
      const activePt = coords[hoverIndex];

      // Línea de referencia
      ctx.lineWidth = 1 * this.scaleRatio;
      ctx.strokeStyle = primaryColor + '60';
      ctx.beginPath();
      ctx.moveTo(activePt.x, paddingTop);
      ctx.lineTo(activePt.x, height - paddingBottom);
      ctx.stroke();

      // Círculo del punto
      ctx.fillStyle = primaryColor;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * this.scaleRatio;
      ctx.beginPath();
      ctx.arc(activePt.x, activePt.y, 6 * this.scaleRatio, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  /**
   * Maneja el movimiento del mouse sobre el canvas: detecta el punto más cercano y muestra el tooltip.
   * @param {MouseEvent} e - Evento de mouse.
   */
  handleMouseMove(e) {
    if (this.points.length === 0 || this.chartType === 'donut') return;

    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * this.scaleRatio;

    const paddingLeft = 45 * this.scaleRatio;
    const paddingRight = 15 * this.scaleRatio;
    const graphWidth = this.canvas.width - paddingLeft - paddingRight;
    const stepX = graphWidth / (this.points.length - 1 || 1);
    
    let hoverIndex = Math.round((x - paddingLeft) / stepX);
    hoverIndex = Math.max(0, Math.min(this.points.length - 1, hoverIndex));

    this.draw(hoverIndex);

    const activePt = this.points[hoverIndex];
    this.tooltip.textContent = `${activePt.label}: ${activePt.value}`;
    this.tooltip.classList.add('c-chart__tooltip--visible');

    const cssPaddingLeft = 45;
    const cssPaddingRight = 15;
    const cssStepX = (rect.width - cssPaddingLeft - cssPaddingRight) / (this.points.length - 1 || 1);
    const tooltipLeft = cssPaddingLeft + hoverIndex * cssStepX;
    
    const cssPaddingTop = 20;
    const cssPaddingBottom = 30;
    const cssGraphHeight = rect.height - cssPaddingTop - cssPaddingBottom;
    const ratio = activePt.value / Math.max(...this.points.map(p => p.value), 10);
    const tooltipTop = cssPaddingTop + cssGraphHeight * (1 - ratio);

    this.tooltip.style.left = `${tooltipLeft}px`;
    this.tooltip.style.top = `${tooltipTop}px`;
  }

  /**
   * Oculta el tooltip y redibuja sin hover al salir el mouse del canvas.
   */
  handleMouseLeave() {
    this.draw();
    this.tooltip.classList.remove('c-chart__tooltip--visible');
  }

  /**
   * Limpia todos los listeners: bus, resize, mouse y clicks en tabs.
   * @override
   */
  onDestroy() {
    this.off('chart:update', this._onUpdate);
    window.removeEventListener('resize', this._onResize);
    if (this.canvas) {
      this.canvas.removeEventListener('mousemove', this._onMouseMove);
      this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
    }
    if (this.tabs) {
      this.tabs.forEach(tab => tab.removeEventListener('click', this._onTabClick));
    }
  }
}
