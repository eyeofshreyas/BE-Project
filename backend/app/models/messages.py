"""Pydantic request/response schemas for client-lawyer conversations and messages."""

from typing import Literal

from pydantic import BaseModel


class ConversationCreate(BaseModel):
    """Request body for POST /messages/conversations: get-or-create a conversation with the
    given other party (a lawyer_id when the caller is a client, a client_id when the caller
    is a lawyer)."""
    other_party_id: int


class MessageSummary(BaseModel):
    """A single message row shaped for thread responses. Attachment fields are set only on
    messages that carry a file; `attachment_url` is a short-lived signed Storage URL."""
    id: int
    conversation_id: int
    sender_user_id: int
    sender_name: str | None
    body: str
    created_at: str
    attachment_url: str | None = None
    attachment_name: str | None = None
    attachment_type: str | None = None
    attachment_size: int | None = None


class ConversationSummary(BaseModel):
    """A conversation row shaped for the list page: the other party's info plus a
    last-message preview."""
    id: int
    other_party_name: str | None
    other_party_role: Literal["lawyer", "client"]
    last_message: str | None
    last_message_at: str | None
    unread_count: int = 0


class ConversationDetail(BaseModel):
    """A conversation with its full message history, for the thread page."""
    id: int
    other_party_name: str | None
    other_party_role: Literal["lawyer", "client"]
    messages: list[MessageSummary]
