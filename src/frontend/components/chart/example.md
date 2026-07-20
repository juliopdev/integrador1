# Button Component

## Caso 1: El Gráfico Principal de Área / Barras (Ejes Cartesianos)
```ejs
<%
  const mainChartData = [
    { label: 'Jan', value: 4000 },
    { label: 'Feb', value: 5800 },
    { label: 'Mar', value: 4800 },
    { label: 'Apr', value: 7200 },
    { label: 'May', value: 6800 },
    { label: 'Jun', value: 8900 },
    { label: 'Jul', value: 9200 }
  ];
%>

<%- include('frontend/components/chart/ui', {
  id: 'revenue-chart',
  type: 'area', // Inicialmente en Area, el usuario puede alternarlo a Bar en caliente
  height: '240px'
}) %>

<script>
  // En el script/controlador de la página, inicializa los datos:
  const chartEl = document.getElementById('revenue-chart');
  // Una vez montado, emite los puntos iniciales
  window.addEventListener('DOMContentLoaded', () => {
    // Si estás usando el bus de eventos del proyecto:
    // bus.emit('chart:update', { target: 'revenue-chart', points: ... });
  });
</script>
```

## Caso 2: El Gráfico de Dona en el pie de la Tarjeta (Donut)
```ejs
<%
  const donutData = [
    { label: 'Direct', value: 400 },
    { label: 'Email', value: 200 },
    { label: 'Social', value: 300 },
    { label: 'Other', value: 100 }
  ];
%>

<div class="u-flex u-gap-6 u-align-center">
  <!-- Renderiza la dona de forma transparente a la izquierda -->
  <div style="width: 120px; height: 120px;">
    <%- include('frontend/components/chart/ui', {
      id: 'traffic-donut',
      type: 'donut',
      height: '120px',
      showControls: false // Oculta tabs y leyenda por defecto
    }) %>
  </div>
  
  <!-- Lista de leyendas a la derecha -->
  <div class="u-grid u-grid-cols-2 u-gap-x-8 u-gap-y-2">
    <div class="u-flex u-align-center u-gap-2">
      <span class="c-chart__legend-dot c-chart__legend-dot--primary"></span>
      <span class="u-text-xs u-text-muted">Direct <strong class="u-text-normal">400</strong></span>
    </div>
    <div class="u-flex u-align-center u-gap-2">
      <span class="c-chart__legend-dot" style="background-color: var(--color-warning);"></span>
      <span class="u-text-xs u-text-muted">Email <strong class="u-text-normal">200</strong></span>
    </div>
    <div class="u-flex u-align-center u-gap-2">
      <span class="c-chart__legend-dot" style="background-color: var(--color-primary-100);"></span>
      <span class="u-text-xs u-text-muted">Social <strong class="u-text-normal">300</strong></span>
    </div>
    <div class="u-flex u-align-center u-gap-2">
      <span class="c-chart__legend-dot" style="background-color: var(--color-success);"></span>
      <span class="u-text-xs u-text-muted">Other <strong class="u-text-normal">100</strong></span>
    </div>
  </div>
</div>
```
