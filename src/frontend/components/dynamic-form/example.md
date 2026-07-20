# Dynamic Form Component

```ejs
<%
  const applicationResource = {
    name: 'application',
    fields: [
      { 
        name: 'fullName', 
        label: 'Full Name', 
        type: 'string', 
        span: 6, // 2 columnas en desktop
        required: true 
      },
      { 
        name: 'email', 
        label: 'Email', 
        type: 'string', 
        span: 6, // 2 columnas en desktop
        required: true 
      },
      { 
        name: 'role', 
        label: 'Role', 
        type: 'select', 
        span: 12, // Ancho completo
        placeholder: 'Select a role...',
        options: [
          { value: 'developer', label: 'Software Engineer' },
          { value: 'designer', label: 'UI/UX Designer' },
          { value: 'pm', label: 'Product Manager' }
        ],
        required: true 
      },
      { 
        name: 'bio', 
        label: 'Bio', 
        type: 'text', // Genera un textarea
        span: 12,
        required: false 
      }
    ]
  };
%>

<%- include('frontend/components/dynamic-form/ui', {
  resource: applicationResource,
  action: '/api/submit-application',
  submitLabel: 'Submit Application',
  submitClass: 'u-w-full' // Estira el botón a todo el ancho
})%>
```
