-- Run once in the Supabase SQL editor: adds Razorpay Route linked-account tracking to the
-- existing per-org platform_settings row, and per-payment fee/transfer bookkeeping to
-- payments. See docs/superpowers/specs/2026-10-07-razorpay-route-multitenant-design.md.

alter table platform_settings add column if not exists razorpay_account_id text;
alter table platform_settings add column if not exists razorpay_account_status text not null default 'not_started';
-- not_started | pending | needs_clarification | activated | rejected
alter table platform_settings add column if not exists razorpay_account_error text;

alter table payments add column if not exists platform_fee_paise bigint;
alter table payments add column if not exists firm_amount_paise bigint;
alter table payments add column if not exists transfer_status text;
