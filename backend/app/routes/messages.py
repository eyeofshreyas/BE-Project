"""Binds conversation/message URLs to controllers.messages functions. No logic."""

from fastapi import APIRouter
from app.controllers.messages import get_or_create_conversation, list_conversations, get_conversation, send_message
from app.models.messages import ConversationSummary, ConversationDetail, MessageSummary

router = APIRouter(prefix="/messages", tags=["messages"])

router.get("/conversations", response_model=list[ConversationSummary])(list_conversations)
router.post("/conversations", response_model=ConversationSummary)(get_or_create_conversation)
router.get("/conversations/{conversation_id}", response_model=ConversationDetail)(get_conversation)
router.post("/conversations/{conversation_id}/messages", response_model=MessageSummary)(send_message)
