-- Fictional accounts for local development and tests.
INSERT OR IGNORE INTO platform_users(id, email, display_name) VALUES
  ('fixture-editor', 'editor@example.com', 'Demo Editor'),
  ('fixture-volunteer', 'volunteer@example.com', 'Demo Volunteer'),
  ('fixture-denied', 'denied@example.com', 'Demo Reviewer'),
  ('fixture-no-delete', 'nodelete@example.com', 'Demo Contributor');

INSERT OR IGNORE INTO platform_roles(app, role, label) VALUES
  ('media', 'volunteer', 'Volunteer');

INSERT OR IGNORE INTO platform_role_permissions(app, role, permission) VALUES
  ('media', 'volunteer', 'media.access');

INSERT OR IGNORE INTO platform_user_app_roles(user_id, app, role) VALUES
  ('fixture-editor', 'notes', 'admin'),
  ('fixture-volunteer', 'media', 'volunteer'),
  ('fixture-denied', 'notes', 'editor'),
  ('fixture-no-delete', 'notes', 'editor');

INSERT OR IGNORE INTO platform_user_permission_overrides(user_id, permission, effect) VALUES
  ('fixture-denied', 'notes.sermons.edit', 'deny'),
  ('fixture-no-delete', 'notes.sermons.delete', 'deny');
