from fastapi import APIRouter
from app.controllers.judgements import list_judgements, create_judgement
from app.models.judgements import JudgementSummary

router = APIRouter(tags=["judgements"])

router.get("/judgements", response_model=list[JudgementSummary])(list_judgements)
router.post("/judgements", response_model=JudgementSummary)(create_judgement)
