# Button Component

```ejs
<!-- Botón Secundario Mediano -->
<%- include('frontend/components/button/ui', { 
  variant: 'secondary', 
  label: 'Secondary',
  size: 'md' 
}) %>

<!-- Botón Ghost con icono de flecha a la derecha -->
<%- include('frontend/components/button/ui', { 
  variant: 'ghost', 
  label: 'Ghost', 
  icon: 'arrow-right',
  iconAlign: 'right',
  size: 'md'
}) %>

<!-- Botón XS para acciones compactas -->
<%- include('frontend/components/button/ui', { 
  variant: 'primary', 
  label: 'XS', 
  size: 'xs' 
}) %>
```
