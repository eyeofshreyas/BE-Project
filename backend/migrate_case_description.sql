-- Run once in the Supabase SQL editor: adds the "description" field shown in
-- the client's case detail modal, and backfills it for the cases already
-- seeded by seed.sql. New cases populate this column directly at creation
-- (see create_case in app/controllers/cases.py) instead of only going into
-- a case_note.
--
-- The descriptions are also the text /ai/case-search ranks against (see
-- _searchable_text in app/ml/case_search.py), so a case with a one-line
-- description or none at all is effectively unfindable by meaning. Every
-- seeded case therefore gets a description that says what the matter
-- actually is; the conveyancing ones are written from their own
-- conveyancing_matters and properties rows. Re-running is safe.

alter table cases add column if not exists description text;

update cases set description = v.description
from (values
  ('CIV2026001', 'Boundary dispute with Metro Builders over encroachment on the Kulkarni residential plot. Currently gathering survey and title evidence.'),
  ('FAM2026001', 'Matrimonial dispute involving maintenance and custody terms for the Shah family, in progress before the City Civil Court.'),
  ('COR2026001', 'Contract dispute with Desai Enterprises over an alleged breach of a supply agreement, currently at the pleadings stage.'),
  ('PROP2026001', 'Registration of a property transfer for the Kulkarni residence at the Sub-Registrar Office, Indiranagar. Stamp duty has been assessed and the deed is being lodged for registration.'),

  ('CRI2026002', 'Prosecution under Section 138 of the Negotiable Instruments Act over a dishonoured cheque. The statutory demand notice has been served and the complaint is at the evidence stage.'),
  ('CON2026003', 'Buyer-side conveyancing on a residential purchase in Pune. The title search and encumbrance certificate are done; awaiting the draft sale deed and the stamp duty assessment.'),
  ('CON2026004', 'Seller-side conveyancing on the sale of Sai Residency, a residential house at Kothrud, Pune (survey SV221, CTS3402) valued at around 1.5 crore. The sale deed is executed and registration is scheduled at the Sub-Registrar Office.'),

  ('PROP2026101', 'Seller-side conveyancing on the sale of the Smith Residence, a residential property at 12 Baker Street, Bengaluru (survey SY-201), with a market value of about 65 lakh. Outstanding title and identity documents are still being collected from the seller before the draft sale deed can be settled.'),
  ('PROP2026102', 'Commercial lease of Acme Corp Block B, a 6,500 sq ft industrial unit in the Whitefield Industrial Area, Bengaluru (survey SY-330). The lease deed is being drafted; rent, escalation and lock-in terms are still under negotiation.'),
  ('PROP2026103', 'Buyer-side purchase of the Williams Apartment at 7 Residency Road, Bengaluru (survey SY-410), at about 98 lakh. Stamp duty has been paid and the instrument lodged with the Sub-Registrar; awaiting the registered deed.'),
  ('PROP2026104', 'Off-the-plan purchase of an apartment that has not been built yet, at Sarjapur Road Phase 2, Bengaluru (survey SY-512), for about 72 lakh. The builder''s agreement to sell is being drafted, with possession timelines, construction-linked payment milestones and delay compensation the open points.'),
  ('PROP2026105', 'Mortgage over Unit 8, a commercial shop at 8 Commercial Street, Bengaluru (survey SY-88) valued at about 43 lakh, charged as security for a loan. The mortgage deed has been registered and the transaction is complete.'),
  ('PROP2026106', 'Transfer of the Smith family residential estate at Trust Estate, Jayanagar, Bengaluru (survey SY-777), worth about 1.5 crore, into a family trust by trust deed. The deed has been settled and registration at the Sub-Registrar Office is scheduled.'),

  -- The two remaining test fixtures. Described as what they are rather than
  -- dressed up as real matters, so nobody reads them as a client's actual case
  -- and so a search for "test" surfaces them. See cleanup_qa_cases.sql for why
  -- they were kept when the QA probe cases were removed.
  ('TEST2026001', 'Test fixture, not a real matter. A near-empty civil case before the Pune District Court, kept because it carries invoice INV-182822 and its payment row, which the billing flow is exercised against.'),
  ('CIV2026002', 'Test fixture, not a real matter. A civil case before the Pune District Court used as the end-to-end API test case: it carries a completed hearing on 15 October 2026, a completed kickoff meeting, uploaded documents, a generated AI summary, and a partially paid invoice with its payment row. Deleting it would break those flows.')
) as v(case_number, description)
where cases.case_number = v.case_number;
