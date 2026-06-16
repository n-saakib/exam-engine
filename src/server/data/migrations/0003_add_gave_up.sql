-- 0003_add_gave_up — add the per-question "gave up" intent column.
--
-- ADR (forthcoming): "gave up" is a first-class question outcome distinct
-- from "revealed" (which is the submit-for-review reveal flow). We capture
-- the user's intent at the moment they click "Give up" / "Submit" on the
-- last question, and persist it so the navigator swatch and the results
-- filter can distinguish the two paths through a refresh.
--
-- Backfill: any pre-existing row that was revealed with no selection was a
-- give-up under the old (pre-0003) behaviour. Rows revealed WITH a selection
-- are NOT give-ups — those remain on the "revealed" outcome.
ALTER TABLE session_answers ADD COLUMN is_gave_up INTEGER NOT NULL DEFAULT 0;
UPDATE session_answers
   SET is_gave_up = 1
 WHERE is_revealed = 1 AND selected_options = '[]';
