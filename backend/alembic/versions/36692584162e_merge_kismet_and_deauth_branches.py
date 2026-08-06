"""merge_kismet_and_deauth_branches

Revision ID: 36692584162e
Revises: add_deauth_tables, 5c2915c81bb9
Create Date: 2026-08-06 03:47:53.115049+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '36692584162e'
down_revision: Union[str, Sequence[str], None] = ('add_deauth_tables', '5c2915c81bb9')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
