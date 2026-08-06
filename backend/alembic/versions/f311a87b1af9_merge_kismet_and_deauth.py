"""merge_kismet_and_deauth

Revision ID: f311a87b1af9
Revises: 95dfbc238510
Create Date: 2026-08-06 03:51:05.371332+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f311a87b1af9'
down_revision: Union[str, Sequence[str], None] = '95dfbc238510'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
