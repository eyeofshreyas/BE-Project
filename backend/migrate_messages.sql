-- Run once in the Supabase SQL editor: adds the conversations/messages tables
-- backing the client-lawyer messaging feature (backend/app/controllers/messages.py).

create table if not exists conversations (
  id bigint generated always as identity primary key,
  client_id bigint not null references clients(client_id),
  lawyer_id bigint not null references lawyers(lawyer_id),
  created_at timestamptz not null default now(),
  unique (client_id, lawyer_id)
);

create table if not exists messages (
  id bigint generated always as identity primary key,
  conversation_id bigint not null references conversations(id),
  sender_user_id bigint not null references users(user_id),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx on messages(conversation_id);
