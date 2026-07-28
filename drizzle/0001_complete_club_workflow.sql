-- Create real unique index on automation_key in organizer_tasks
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizer_tasks_automation_key ON organizer_tasks (automation_key) WHERE automation_key IS NOT NULL;

-- Migrate player lifecycle_status values
-- blocked -> blocked, others -> normal
UPDATE players SET lifecycle_status = 'blocked' WHERE lifecycle_status = 'blocked';
UPDATE players SET lifecycle_status = 'normal' WHERE lifecycle_status NOT IN ('normal', 'paused', 'blocked');
