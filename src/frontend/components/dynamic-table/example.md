# Dynamic Table Component

```ejs
<%
  const usersResource = {
    name: 'users',
    fields: [
      { name: 'name', label: 'Name', type: 'string' },
      { name: 'role', label: 'Role', type: 'string' },
      { name: 'status', label: 'Status', type: 'string' },
      { name: 'email', label: 'Email', type: 'string' }
    ]
  };

  const usersRows = [
    { id: '1', name: 'Aria Chen', role: 'Engineer', status: 'Active', email: 'aria@devco.io' },
    { id: '2', name: 'Marcus Lee', role: 'Designer', status: 'Active', email: 'marcus@devco.io' },
    { id: '3', name: 'Sofia Reyes', role: 'PM', status: 'Away', email: 'sofia@devco.io' },
    { id: '4', name: 'James Park', role: 'Engineer', status: 'Offline', email: 'james@devco.io' },
    { id: '5', name: 'Elena Mora', role: 'Marketing', status: 'Active', email: 'elena@devco.io' }
  ];
%>

<%- include('frontend/components/dynamic-table/ui', {
  resource: usersResource,
  rows: usersRows,
  enableActions: true
})%>
```
