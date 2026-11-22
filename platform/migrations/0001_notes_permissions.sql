INSERT OR IGNORE INTO platform_roles(app, role, label) VALUES
  ('notes', 'editor', 'Notes editor'),
  ('notes', 'admin', 'Notes admin');

INSERT OR IGNORE INTO platform_role_permissions(app, role, permission) VALUES
  ('notes', 'editor', 'notes.access'),
  ('notes', 'editor', 'notes.sermons.view'),
  ('notes', 'editor', 'notes.sermons.edit'),
  ('notes', 'editor', 'notes.sermons.delete'),
  ('notes', 'admin', 'notes.access'),
  ('notes', 'admin', 'notes.sermons.view'),
  ('notes', 'admin', 'notes.sermons.edit'),
  ('notes', 'admin', 'notes.sermons.delete'),
  ('notes', 'admin', 'notes.admin');
