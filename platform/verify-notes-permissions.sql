SELECT r.role, r.label, p.permission
FROM platform_roles r
LEFT JOIN platform_role_permissions p USING (app, role)
WHERE r.app = 'notes'
ORDER BY r.role, p.permission;

-- Replace REPLACE_WITH_EMAIL with the same email used in the grant.
SELECT u.active, r.role
FROM platform_users u
LEFT JOIN platform_user_app_roles r ON r.user_id = u.id AND r.app = 'notes'
WHERE u.email = 'REPLACE_WITH_EMAIL' COLLATE NOCASE
ORDER BY r.role;

SELECT p.permission
FROM platform_effective_permissions p
JOIN platform_users u ON u.id = p.user_id
WHERE u.email = 'REPLACE_WITH_EMAIL' COLLATE NOCASE AND p.permission GLOB 'notes.*'
ORDER BY p.permission;
