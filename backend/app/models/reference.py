from pydantic import BaseModel


class CaseType(BaseModel):
    case_type_id: int
    case_type_name: str
    description: str | None


class Court(BaseModel):
    court_id: int
    court_name: str
    court_type: str | None
    city: str | None
    state: str | None
    address: str | None


class Role(BaseModel):
    role_id: int
    role_name: str
    description: str | None


class Judge(BaseModel):
    judge_id: int
    judge_name: str
    designation: str | None
    court_id: int
    court_name: str | None


class DocumentType(BaseModel):
    document_type_id: int
    type_name: str
    description: str | None
