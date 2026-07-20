# Card Component


## Caso 1: Tarjeta con Filas Clave-Valor (Analytics Overview)
```ejs
<!-- Botón Secundario Mediano -->
<%- include('frontend/components/card/ui', {
  title: 'Analytics Overview',
  subtitle: 'Monthly performance for Q3 2025.',
  hasDivider: true,
  body: `
    <div class="c-card__row">
      <span class="c-card__row-label">Revenue</span>
      <span class="c-card__row-value">$42,350</span>
    </div>
  `
}) %>
```

## Caso 2: Tarjeta con Cabecera Multimedia (World Coverage)
```ejs
<%- include('frontend/components/card/ui', {
  mediaIcon: 'globe',
  title: 'World Coverage',
  subtitle: 'Deployed across 42 regions globally.',
  padding: 'md'
}) %>
```

## Caso 3: Tarjeta de Métricas (Total Users)
```ejs
<%- include('frontend/components/card/ui', {
  body: `
    <div class="c-card__stat">
      <span class="c-card__stat-label">Total Users</span>
      <span class="c-card__stat-value">128,450</span>
      <span class="c-card__stat-trend c-card__stat-trend--up">
        ✓ +12.4% from last month
      </span>
    </div>
  `
}) %>
```

## Caso 4: Tarjeta con Icono y Botón en el Pie (Notifications)
```ejs
<%- include('frontend/components/card/ui', {
  icon: 'bell',
  title: 'Notifications',
  subtitle: '3 unread alerts',
  body: '',
  footer: include('frontend/components/button/ui', { 
    variant: 'ghost', 
    label: 'View All',
    class: 'u-w-full'
  })
}) %>
```
