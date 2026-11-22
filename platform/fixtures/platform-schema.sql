-- Local fixture only. Platform DDL from rfclakeland/rfc-digital-platform at 8e28225.
-- Media roster synchronization and built-in role seeds are omitted.
CREATE TABLE IF NOT EXISTS platform_users (
 id TEXT PRIMARY KEY NOT NULL,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 display_name TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 webauthn_user_id TEXT UNIQUE,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS platform_passwords (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
 password_hash TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_sessions (
 id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
 token_hash TEXT NOT NULL UNIQUE,
 user_id TEXT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at>created_at),
 password_grant_expires_at INTEGER,
 revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS platform_sessions_user_idx ON platform_sessions(user_id);
CREATE INDEX IF NOT EXISTS platform_sessions_expiry_idx ON platform_sessions(expires_at);
CREATE TABLE IF NOT EXISTS platform_roles (
 app TEXT NOT NULL,
 role TEXT NOT NULL,
 label TEXT NOT NULL,
 PRIMARY KEY(app,role)
);
CREATE TABLE IF NOT EXISTS platform_role_permissions (
 app TEXT NOT NULL,
 role TEXT NOT NULL,
 permission TEXT NOT NULL CHECK(substr(permission,1,length(app)+1)=app||'.'),
 PRIMARY KEY(app,role,permission),
 FOREIGN KEY(app,role) REFERENCES platform_roles(app,role) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS platform_user_app_roles (
 user_id TEXT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
 app TEXT NOT NULL,
 role TEXT NOT NULL,
 granted_at INTEGER NOT NULL DEFAULT (unixepoch()),
 granted_by TEXT REFERENCES platform_users(id) ON DELETE SET NULL,
 PRIMARY KEY(user_id,app,role),
 FOREIGN KEY(app,role) REFERENCES platform_roles(app,role) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS platform_user_permission_overrides (
 user_id TEXT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
 permission TEXT NOT NULL,
 effect TEXT NOT NULL CHECK(effect IN ('grant','deny')),
 PRIMARY KEY(user_id,permission)
);

CREATE VIEW IF NOT EXISTS platform_effective_permissions AS
 WITH grants(user_id,permission) AS (
  SELECT r.user_id,p.permission
  FROM platform_user_app_roles r JOIN platform_role_permissions p USING(app,role)
  UNION
  SELECT user_id,permission FROM platform_user_permission_overrides WHERE effect='grant'
 )
 SELECT g.user_id,g.permission FROM grants g JOIN platform_users u ON u.id=g.user_id
 WHERE u.active=1 AND NOT EXISTS(
  SELECT 1 FROM platform_user_permission_overrides o
  WHERE o.user_id=g.user_id AND o.permission=g.permission AND o.effect='deny'
 );

CREATE TABLE IF NOT EXISTS platform_email_links (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
 email_snapshot TEXT NOT NULL COLLATE NOCASE,
 token_hash TEXT NOT NULL UNIQUE,
 purpose TEXT NOT NULL CHECK(purpose IN ('signin','setup')),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at>created_at),
 consumed_at INTEGER,
 requested_ip_hash TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_email_links_live_idx ON platform_email_links(user_id) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS platform_email_links_expiry_idx ON platform_email_links(expires_at);

CREATE TABLE IF NOT EXISTS platform_auth_rate_limits (
 scope TEXT NOT NULL,
 subject_hash TEXT NOT NULL,
 window_start INTEGER NOT NULL,
 count INTEGER NOT NULL CHECK(count>0),
 expires_at INTEGER NOT NULL,
 PRIMARY KEY(scope,subject_hash,window_start)
);
CREATE INDEX IF NOT EXISTS platform_auth_rate_limits_expiry_idx ON platform_auth_rate_limits(expires_at);

CREATE TRIGGER IF NOT EXISTS platform_identity_revoke AFTER UPDATE OF active ON platform_users
WHEN NEW.active=0 AND OLD.active<>NEW.active
BEGIN
 UPDATE platform_sessions SET revoked_at=unixepoch()
 WHERE user_id=NEW.id AND revoked_at IS NULL;
 UPDATE platform_email_links SET consumed_at=unixepoch()
 WHERE user_id=NEW.id AND consumed_at IS NULL;
END;

CREATE TRIGGER IF NOT EXISTS platform_last_role_removed AFTER DELETE ON platform_user_app_roles
WHEN NOT EXISTS(SELECT 1 FROM platform_user_app_roles WHERE user_id=OLD.user_id)
 AND NOT EXISTS(SELECT 1 FROM platform_user_permission_overrides
  WHERE user_id=OLD.user_id AND effect='grant' AND permission GLOB '*.access')
BEGIN
 UPDATE platform_users SET active=0,updated_at=unixepoch() WHERE id=OLD.user_id;
END;

CREATE TABLE IF NOT EXISTS platform_passkeys (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
 credential_id TEXT NOT NULL UNIQUE,
 public_key TEXT NOT NULL,
 sign_count INTEGER NOT NULL DEFAULT 0,
 transports TEXT,
 device_type TEXT,
 backed_up INTEGER,
 label TEXT,
 created_at INTEGER NOT NULL,
 last_used_at INTEGER
);
CREATE INDEX IF NOT EXISTS platform_passkeys_user_idx ON platform_passkeys(user_id);

CREATE TABLE IF NOT EXISTS platform_webauthn_challenges (
 id TEXT PRIMARY KEY,
 challenge_hash TEXT NOT NULL UNIQUE,
 purpose TEXT NOT NULL CHECK(purpose IN ('register','authenticate')),
 user_id TEXT REFERENCES platform_users(id) ON DELETE CASCADE,
 session_id TEXT REFERENCES platform_sessions(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at>created_at),
 consumed_at INTEGER,
 CHECK((purpose='register' AND user_id IS NOT NULL AND session_id IS NOT NULL)
    OR (purpose='authenticate' AND user_id IS NULL AND session_id IS NULL))
);
CREATE INDEX IF NOT EXISTS platform_webauthn_challenges_expiry_idx ON platform_webauthn_challenges(expires_at);
CREATE INDEX IF NOT EXISTS platform_webauthn_challenges_session_idx ON platform_webauthn_challenges(session_id);

CREATE TRIGGER IF NOT EXISTS platform_passkeys_revoke AFTER UPDATE OF active ON platform_users
WHEN NEW.active=0 AND OLD.active<>NEW.active
BEGIN
 DELETE FROM platform_passkeys WHERE user_id=NEW.id;
 UPDATE platform_webauthn_challenges SET consumed_at=unixepoch()
 WHERE user_id=NEW.id AND consumed_at IS NULL;
END;

