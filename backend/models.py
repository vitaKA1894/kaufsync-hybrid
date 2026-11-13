from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Table, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
import secrets
import string
from database import Base

def generate_uuid():
    return str(uuid.uuid4())

def utc_now():
    return datetime.now(timezone.utc)

# Generiert einen 6-stelligen Code aus Großbuchstaben und Zahlen
def generate_share_code():
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))

# Zwischentabelle: Speichert, welcher User in welcher Liste Mitglied ist
list_members = Table(
    'list_members',
    Base.metadata,
    Column('user_id', String, ForeignKey('users.id'), primary_key=True),
    Column('list_id', String, ForeignKey('lists.id'), primary_key=True)
)

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    display_name = Column(String)
    is_admin = Column(Boolean, default=False)
    status = Column(String, default="pending") # 'pending', 'active', 'locked'
    settings_push_async_events = Column(Boolean, default=False)
    settings_push_new_items = Column(Boolean, default=False)
    settings_push_admin_pending_users = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utc_now)

class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    token = Column(String, index=True)
    expires_at = Column(DateTime)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utc_now)

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    title = Column(String)
    body = Column(String)
    action_url = Column(String, nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utc_now)

class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    endpoint = Column(String)
    p256dh = Column(String)
    auth = Column(String)
    created_at = Column(DateTime, default=utc_now)

class List(Base):
    __tablename__ = "lists"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String)
    icon_name = Column(String)
    created_at = Column(DateTime, default=utc_now)
    created_by = Column(String, ForeignKey("users.id"), index=True)
    share_code = Column(String, unique=True, index=True, default=generate_share_code)
    
    # Beziehungen
    items = relationship("Item", back_populates="shopping_list", cascade="all, delete-orphan")
    members = relationship("User", secondary=list_members, backref="shared_lists")
    creator = relationship("User", foreign_keys=[created_by])

class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id = Column(String, primary_key=True, default=generate_uuid)
    list_id = Column(String, ForeignKey("lists.id"), index=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    action_type = Column(String) # 'added', 'completed', 'deleted', 'reactivated', 'started'
    item_name = Column(String)
    created_at = Column(DateTime, default=utc_now)

    # Beziehungen
    list = relationship("List")
    user = relationship("User", foreign_keys=[user_id])

class Item(Base):
    __tablename__ = "items"
    id = Column(String, primary_key=True, default=generate_uuid)
    list_id = Column(String, ForeignKey("lists.id"), index=True)
    name = Column(String)
    category = Column(String, nullable=True)
    quantity = Column(Integer, default=1)
    unit = Column(String, default="Stk")
    note = Column(String, nullable=True)
    status = Column(String, default="active")
    tags = Column(String, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    last_modified_by = Column(String, ForeignKey("users.id"), nullable=True)
    
    shopping_list = relationship("List", back_populates="items")

class ListInvitation(Base):
    __tablename__ = "list_invitations"
    id = Column(String, primary_key=True, default=generate_uuid)
    list_id = Column(String, ForeignKey("lists.id"), index=True)
    inviter_id = Column(String, ForeignKey("users.id"), index=True)
    invitee_id = Column(String, ForeignKey("users.id"), index=True)
    status = Column(String, default="pending") # "pending", "accepted", "declined"
    created_at = Column(DateTime, default=utc_now)

    # Beziehungen
    list = relationship("List")
    inviter = relationship("User", foreign_keys=[inviter_id])
    invitee = relationship("User", foreign_keys=[invitee_id])

class ListJoinRequest(Base):
    __tablename__ = "list_join_requests"
    id = Column(String, primary_key=True, default=generate_uuid)
    list_id = Column(String, ForeignKey("lists.id"), index=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    status = Column(String, default="pending") # "pending", "approved", "rejected"
    created_at = Column(DateTime, default=utc_now)

    list = relationship("List")
    user = relationship("User")

