# app/services/deauth/base.py
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)

class DeauthBaseService:
    def __init__(self, db: Session):
        self.db = db