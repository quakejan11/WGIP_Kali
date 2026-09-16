"""add targets table

Revision ID: 76f79321c08f
Revises: 921fcd9f8c9d
Create Date: 2026-09-15 19:48:36.632590+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '76f79321c08f'
down_revision: Union[str, Sequence[str], None] = '921fcd9f8c9d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'targets',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('bssid', sa.String(), nullable=False, unique=True, index=True),
        sa.Column('ssid', sa.String(), nullable=True),
        sa.Column('channel', sa.Integer(), nullable=False),
        sa.Column('signal', sa.Integer(), nullable=True),
        sa.Column('handshake', sa.String(), nullable=True, server_default='pending'),
        sa.Column('status', sa.String(), nullable=True, server_default='pending'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('targets')