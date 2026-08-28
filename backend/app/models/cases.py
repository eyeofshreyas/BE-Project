from pydantic import BaseModel


class CaseSummary(BaseModel):
    id: str
    client: str | None
    lawyer: str | None
    court: str | None
    status: str
    hearing: str | None
    priority: str
