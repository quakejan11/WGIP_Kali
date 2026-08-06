"""add_deauth_tables

Revision ID: add_deauth_tables
Revises: add_mac_manufacturers
Create Date: 2026-08-06 10:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_deauth_tables'
down_revision = 'add_mac_manufacturers'
branch_labels = None
depends_on = None


def upgrade():
    # Create deauth_devices table
    op.create_table(
        'deauth_devices',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('device_profile_id', sa.Integer(), nullable=True),
        sa.Column('client_mac', sa.String(32), nullable=False),
        sa.Column('status', sa.String(20), server_default='active', nullable=False),
        sa.Column('display_name', sa.String(255), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('last_deauth_attempt', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deauth_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('client_mac')
    )
    op.create_index('ix_deauth_devices_client_mac', 'deauth_devices', ['client_mac'])
    op.create_index('ix_deauth_devices_status', 'deauth_devices', ['status'])
    op.create_index('ix_deauth_devices_device_profile_id', 'deauth_devices', ['device_profile_id'])
    
    # Create deauth_logs table
    op.create_table(
        'deauth_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('deauth_device_id', sa.Integer(), nullable=True),
        sa.Column('client_mac', sa.String(32), nullable=False),
        sa.Column('device_profile_id', sa.Integer(), nullable=True),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('operator', sa.String(100), nullable=True),
        sa.Column('packets_sent', sa.Integer(), server_default='0', nullable=False),
        sa.Column('success', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('requested_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('executed_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_deauth_logs_client_mac', 'deauth_logs', ['client_mac'])
    op.create_index('ix_deauth_logs_success', 'deauth_logs', ['success'])
    op.create_index('ix_deauth_logs_requested_at', 'deauth_logs', ['requested_at'])
    
    # Create deauth_queue table
    op.create_table(
        'deauth_queue',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('deauth_device_id', sa.Integer(), nullable=True),
        sa.Column('client_mac', sa.String(32), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('operator', sa.String(100), nullable=True),
        sa.Column('priority', sa.String(20), server_default='medium', nullable=False),
        sa.Column('status', sa.String(20), server_default='pending', nullable=False),
        sa.Column('retry_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('max_retries', sa.Integer(), server_default='3', nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('processed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_deauth_queue_client_mac', 'deauth_queue', ['client_mac'])
    op.create_index('ix_deauth_queue_status_priority', 'deauth_queue', ['status', 'priority'])


def downgrade():
    op.drop_table('deauth_queue')
    op.drop_table('deauth_logs')
    op.drop_table('deauth_devices')