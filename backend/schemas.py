from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# --- USER SCHEMAS ---
class UserCreate(BaseModel):
    email: str
    password: str
    display_name: str

# NEU: Für das Profil-Update
class UserUpdate(BaseModel):
    display_name: str
    settings_push_async_events: Optional[bool] = None
    settings_push_new_items: Optional[bool] = None
    settings_push_completed_items: Optional[bool] = None
    settings_push_cleared_items: Optional[bool] = None
    settings_push_shopping_started: Optional[bool] = None
    settings_push_shopping_done: Optional[bool] = None
    settings_push_members: Optional[bool] = None
    settings_push_quiet_hours: Optional[bool] = None
    settings_push_quiet_start: Optional[str] = None
    settings_push_quiet_end: Optional[str] = None
    settings_sound_enabled: Optional[bool] = None
    settings_vibration_enabled: Optional[bool] = None
    settings_push_admin_pending_users: Optional[bool] = None
    keep_screen_awake: Optional[bool] = None
    haptic_feedback_enabled: Optional[bool] = None

# NEU: Für die Passwort-Änderung
class PasswordUpdate(BaseModel):
    old_password: str
    new_password: str

class DeleteAccountRequest(BaseModel):
    current_password: str

class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str
    is_admin: Optional[bool] = False
    status: str
    settings_push_async_events: Optional[bool] = True
    settings_push_new_items: Optional[bool] = True
    settings_push_completed_items: Optional[bool] = True
    settings_push_cleared_items: Optional[bool] = True
    settings_push_shopping_started: Optional[bool] = True
    settings_push_shopping_done: Optional[bool] = False
    settings_push_members: Optional[bool] = True
    settings_push_quiet_hours: Optional[bool] = False
    settings_push_quiet_start: Optional[str] = "22:00"
    settings_push_quiet_end: Optional[str] = "07:00"
    settings_sound_enabled: Optional[bool] = True
    settings_vibration_enabled: Optional[bool] = True
    settings_push_admin_pending_users: Optional[bool] = False
    keep_screen_awake: Optional[bool] = False
    haptic_feedback_enabled: Optional[bool] = True

    class Config:
        from_attributes = True

class UserPublicResponse(BaseModel):
    id: str
    display_name: str

    class Config:
        from_attributes = True

class NotificationResponse(BaseModel):
    id: str
    title: str
    body: str
    action_url: Optional[str] = None
    is_read: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class PushSubscriptionCreate(BaseModel):
    endpoint: str
    p256dh: str
    auth: str

class LoginRequest(BaseModel):
    email: str
    password: str

# --- ITEM SCHEMAS ---
class ItemBase(BaseModel):
    name: str
    category: Optional[str] = "Sonstiges"
    quantity: float = 1.0
    unit: Optional[str] = "Stk"
    note: Optional[str] = None
    tags: Optional[str] = None

class ItemCreate(ItemBase):
    id: Optional[str] = None

class ItemUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    status: Optional[str] = None
    quantity: Optional[float] = None
    note: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[str] = None

class ItemResponse(ItemBase):
    id: str
    list_id: str
    status: str
    updated_at: Optional[datetime] = None
    is_deleted: Optional[bool] = False
    
    class Config:
        from_attributes = True

# --- SYNC SCHEMAS ---
class ClientMutation(BaseModel):
    id: Optional[str] = None
    action: str  # 'ADD_ITEM', 'UPDATE_ITEM', 'DELETE_ITEM', 'TOGGLE_STATUS', 'CLEAR_COMPLETED'
    item_id: Optional[str] = None
    payload: Optional[dict] = None
    client_timestamp: Optional[str] = None

class ListSyncRequest(BaseModel):
    last_synced_at: Optional[str] = None
    mutations: List[ClientMutation] = []

class ListSyncResponse(BaseModel):
    server_time: str
    processed_count: int
    items: List[ItemResponse]
    deleted_item_ids: List[str] = []

# --- LIST SCHEMAS ---
class ListBase(BaseModel):
    name: str
    icon_name: Optional[str] = "mdi-cart"

class ListCreate(ListBase):
    pass

class ListResponse(ListBase):
    id: str
    created_at: datetime
    created_by: str
    share_code: str
    readonly_token: Optional[str] = None
    readonly_enabled: Optional[bool] = False
    members: List[UserResponse] = []
    creator: Optional[UserResponse] = None
    items: List[ItemResponse] = []  # KORRIGIERT: List statt ListType
    
    class Config:
        from_attributes = True

# --- READONLY LINK SCHEMAS ---
class ReadonlyLinkToggleRequest(BaseModel):
    enabled: Optional[bool] = None

class ReadonlyLinkResponse(BaseModel):
    readonly_token: Optional[str] = None
    readonly_enabled: bool = False

# --- PUBLIC LIST SCHEMAS ---
class PublicItemResponse(BaseModel):
    id: str
    name: str
    category: Optional[str] = "Sonstiges"
    quantity: float = 1.0
    unit: Optional[str] = "Stk"
    note: Optional[str] = None
    status: str = "active"
    tags: Optional[str] = None

    class Config:
        from_attributes = True

class PublicListResponse(BaseModel):
    id: str
    name: str
    icon_name: Optional[str] = None
    created_at: datetime
    items: List[PublicItemResponse] = []

    class Config:
        from_attributes = True

# --- JOIN LIST SCHEMAS ---
class JoinListRequest(BaseModel):
    share_code: str

# --- ACTIVITY LOG SCHEMAS ---
class ActivityLogResponse(BaseModel):
    id: str
    list_id: str
    user_id: Optional[str] = None
    action_type: str
    item_name: str
    created_at: datetime

    # Optional field for frontend display
    user_name: Optional[str] = None

    class Config:
        from_attributes = True

# --- INVITATION SCHEMAS ---
class InviteUserRequest(BaseModel):
    invitee_id: str

class ListInvitationResponse(BaseModel):
    id: str
    list_id: str
    inviter_id: str
    invitee_id: str
    status: str
    created_at: datetime

    # Optional fields for frontend display
    list_name: Optional[str] = None
    inviter_name: Optional[str] = None

    class Config:
        from_attributes = True

# --- RECIPE & BULK SCHEMAS ---
class RecipeParseRequest(BaseModel):
    url: str

class RecipeTextParseRequest(BaseModel):
    text: str
    title: Optional[str] = None

class RecipeIngredientParsed(BaseModel):
    id: Optional[str] = None
    name: str
    quantity: Optional[float] = None
    base_quantity: Optional[float] = None
    unit: Optional[str] = "Stk"
    display_quantity: Optional[str] = None
    display_amount: Optional[str] = None
    specification: Optional[str] = None
    recipe_quantity: Optional[float] = None
    recipe_unit: Optional[str] = None
    tags: Optional[List[str]] = None
    category: str = "Sonstiges"
    icon: Optional[str] = None
    taxonomy_id: Optional[str] = None
    match_confidence: Optional[float] = 0.0
    is_pantry_staple: Optional[bool] = False
    is_staple: Optional[bool] = False
    selected: bool = True
    original_lines: Optional[List[str]] = None
    was_merged: Optional[bool] = False
    raw: str = ""
    original_name: Optional[str] = None
    matched: Optional[bool] = False

class RecipeParseResponse(BaseModel):
    title: str
    image: Optional[str] = None
    servings: float
    source: str
    url: str
    ingredients: List[RecipeIngredientParsed]

class BulkItemCreate(BaseModel):
    items: List[ItemCreate]
    recipe_title: Optional[str] = None

# --- LOYALTY CARD SCHEMAS ---
class LoyaltyCardCreate(BaseModel):
    code_value: str
    code_format: Optional[str] = "CODE_128"

class LoyaltyCardResponse(BaseModel):
    id: str
    user_id: str
    list_id: str
    code_value: str
    code_format: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
