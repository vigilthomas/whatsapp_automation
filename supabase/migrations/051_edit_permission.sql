-- ============================================================
-- 051_edit_permission.sql — "Edit" split out of "Write"
-- ============================================================
-- Access control now has separate ticks for creating records ("write",
-- shown as Create) and changing existing ones ("edit"). Before this,
-- "write" covered both, so every module a designation could write to
-- also gets "edit" here: nobody loses anything until it is unticked.
--
-- Run after 050. Safe to run more than once.

UPDATE designations d
SET permissions = (
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN e->'actions' ? 'write' AND NOT (e->'actions' ? 'edit')
        THEN jsonb_set(e, '{actions}', (e->'actions') || '["edit"]'::jsonb)
      ELSE e
    END
    ORDER BY ord
  ), '[]'::jsonb)
  FROM jsonb_array_elements(d.permissions) WITH ORDINALITY AS x(e, ord)
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(d.permissions) e
  WHERE e->'actions' ? 'write' AND NOT (e->'actions' ? 'edit')
);
