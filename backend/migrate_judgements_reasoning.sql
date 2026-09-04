-- Run once in the Supabase SQL editor: adds the "reasoning" field shown in
-- the judgement detail modal, and backfills it for the rows already seeded
-- by migrate_judgements.sql.

alter table judgements add column if not exists reasoning text;

update judgements set reasoning = v.reasoning
from (values
  ('2026 KAR HC 4521', 'The court examined the invoice trail and correspondence, finding the defendant repeatedly acknowledged the debt before disputing it, which estopped the later denial.'),
  ('2026 KAR HC 5210', 'The appellate bench held the trial court correctly applied the interest clause in the contract and found no perversity in the damages computation.'),
  ('2026 KAR CC 1187', 'The court found partial merit in the plaintiff''s possession claim but held the damages claimed were not fully substantiated by the evidence on record.'),
  ('2026 KAR FC 342', 'Both parties reached a mediated settlement on maintenance and custody terms, which the court recorded as a consent decree.'),
  ('2026 KAR SR 88', 'The registering authority held the chain of title had a defective link and declined registration pending rectification.')
) as v(citation, reasoning)
where judgements.citation = v.citation;
