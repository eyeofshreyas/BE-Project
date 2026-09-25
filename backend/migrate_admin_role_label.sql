-- Run once in the Supabase SQL editor: renames the role_id=1 display label
-- from "Admin" to "Law Firm Manager" -- the role itself, its role_id, and
-- every ADMIN-gated permission in the backend are unchanged, this only
-- updates the human-readable name shown for it (roles.role_name, and the
-- frontend's own ROLE_LABELS maps, updated separately in this same change).

update roles set role_name = 'Law Firm Manager' where role_id = 1;
