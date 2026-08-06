"""merge_branches

Revision ID: 95dfbc238510
Revises: 36692584162e
Create Date: 2026-08-06 03:48:51.615303+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '95dfbc238510'
down_revision: Union[str, Sequence[str], None] = '36692584162e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
