# Input Field Component


## Caso 1: Input de Búsqueda (Search)
```ejs
<%- include('frontend/components/input/ui', {
  label: 'Search',
  icon: 'search',
  placeholder: 'Search...'
}) %>
```

## Caso 2: Campo de Contraseña con Toggle (Password)
```ejs
<%- include('frontend/components/input/ui', {
  label: 'Password',
  type: 'password',
  placeholder: '••••••••'
}) %>
```

## Caso 3: Campo con Prefijo de Enlace (With Prefix)
```ejs
<%- include('frontend/components/input/ui', {
  label: 'With Prefix',
  prefix: 'https://',
  placeholder: 'domain.com'
}) %>
```

## Caso 4: Input en Estado Deshabilitado (Disabled)
```ejs
<%- include('frontend/components/input/ui', {
  label: 'Disabled',
  placeholder: 'Disabled input',
  disabled: true
}) %>
```
