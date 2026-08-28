from fastapi import APIRouter
from app.controllers.reference import (
    list_roles,
    Role,
    list_case_types,
    CaseType,
    list_courts,
    Court,
    list_judges,
    Judge,
)

router = APIRouter(prefix="/reference", tags=["reference"])

router.get("/roles", response_model=list[Role])(list_roles)
router.get("/case-types", response_model=list[CaseType])(list_case_types)
router.get("/courts", response_model=list[Court])(list_courts)
router.get("/judges", response_model=list[Judge])(list_judges)
