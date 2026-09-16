"""add capture fields to targets

Revision ID: 54c59db8b64e
Revises: 76f79321c08f
Create Date: 2026-09-15 20:00:00.000000+00:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '54c59db8b64e'
down_revision: Union[str, Sequence[str], None] = '76f79321c08f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add capture tracking fields."""
    op.add_column('targets', sa.Column('capture_file', sa.String(), nullable=True))
    op.add_column('targets', sa.Column('capture_log', sa.String(), nullable=True))
    op.add_column('targets', sa.Column('capture_pid', sa.Integer(), nullable=True))
    op.add_column('targets', sa.Column('deauth_pid', sa.Integer(), nullable=True))
    op.add_column('targets', sa.Column('capture_started_at', sa.DateTime(), nullable=True))
    op.add_column('targets', sa.Column('capture_stopped_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Remove capture tracking fields."""
    op.drop_column('targets', 'capture_stopped_at')
    op.drop_column('targets', 'capture_started_at')
    op.drop_column('targets', 'deauth_pid')
    op.drop_column('targets', 'capture_pid')
    op.drop_column('targets', 'capture_log')
    op.drop_column('targets', 'capture_file')