"""
ScopeIt - Packing & Moving Estimator Tool API
Placeholder endpoints - implementation will be provided separately.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.domains.tools.dependencies import require_tool_access

router = APIRouter()
_gate = require_tool_access("packing")


@router.post("/estimate")
async def create_packing_estimate(
    db: Session = Depends(get_db),
    current_user=Depends(_gate),
):
    """Create a packing/moving estimate. Placeholder."""
    return {"status": "pending_implementation"}
