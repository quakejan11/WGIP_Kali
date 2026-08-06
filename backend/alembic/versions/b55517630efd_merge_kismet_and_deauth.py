"""merge_kismet_and_deauth

Revision ID: b55517630efd
Revises: f311a87b1af9
Create Date: 2026-08-06 03:51:38.710604+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b55517630efd'
down_revision: Union[str, Sequence[str], None] = 'f311a87b1af9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
