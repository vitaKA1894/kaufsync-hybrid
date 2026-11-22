import os
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, Response, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from typing import List, Dict, Optional
from datetime import timedelta, datetime, timezone
from sqlalchemy.orm import Session
from pydantic import BaseModel

import models, schemas, auth, recipe_service
from database import engine, get_db, SessionLocal
import json
import secrets
from pywebpush import webpush, WebPushException
from dotenv import load_dotenv

load_dotenv()

# Erstellt alle Tabellen in der Datenbank
models.Base.metadata.create_all(bind=engine)

# Spalten-Migration für SQLite sicherstellen
def ensure_columns():
    try:
        with engine.connect() as conn:
            existing_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()]
            cols_to_add = [
                ("settings_push_async_events", "BOOLEAN DEFAULT 1"),
                ("settings_push_completed_items", "BOOLEAN DEFAULT 1"),
                ("settings_push_cleared_items", "BOOLEAN DEFAULT 1"),
                ("settings_push_shopping_started", "BOOLEAN DEFAULT 1"),
                ("settings_push_shopping_done", "BOOLEAN DEFAULT 0"),
                ("settings_push_members", "BOOLEAN DEFAULT 1"),
                ("settings_push_quiet_hours", "BOOLEAN DEFAULT 0"),
                ("settings_push_quiet_start", "VARCHAR DEFAULT '22:00'"),
                ("settings_push_quiet_end", "VARCHAR DEFAULT '07:00'"),
                ("settings_sound_enabled", "BOOLEAN DEFAULT 1"),
                ("settings_vibration_enabled", "BOOLEAN DEFAULT 1"),
                ("keep_screen_awake", "BOOLEAN DEFAULT 0"),
                ("haptic_feedback_enabled", "BOOLEAN DEFAULT 1"),
                ("show_restock_suggestions", "BOOLEAN DEFAULT 1"),
            ]
            for col_name, col_type in cols_to_add:
                if col_name not in existing_cols:
                    conn.exec_driver_sql(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
            
            # Item columns for offline sync
            existing_item_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(items)").fetchall()]
            item_cols_to_add = [
                ("updated_at", "DATETIME"),
                ("is_deleted", "BOOLEAN DEFAULT 0"),
            ]
            for col_name, col_type in item_cols_to_add:
                if col_name not in existing_item_cols:
                    conn.exec_driver_sql(f"ALTER TABLE items ADD COLUMN {col_name} {col_type}")

            # List columns for read-only sharing
            existing_list_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(lists)").fetchall()]
            list_cols_to_add = [
                ("readonly_token", "VARCHAR"),
                ("readonly_enabled", "BOOLEAN DEFAULT 0"),
            ]
            for col_name, col_type in list_cols_to_add:
                if col_name not in existing_list_cols:
                    conn.exec_driver_sql(f"ALTER TABLE lists ADD COLUMN {col_name} {col_type}")
            
            # Altlasten: Einkaufsstart-Einträge aus activity_logs entfernen (gehören nicht in Artikel-Historie)
            try:
                conn.exec_driver_sql("DELETE FROM activity_logs WHERE action_type = 'started'")
            except Exception:
                pass

            # Initial Backfill: Bestehende abgehakte Artikel in purchase_events überführen
            try:
                pe_count = conn.exec_driver_sql("SELECT COUNT(*) FROM purchase_events").scalar()
                if pe_count == 0:
                    rows = conn.exec_driver_sql(
                        "SELECT id, list_id, item_name, created_at FROM activity_logs WHERE action_type = 'completed' AND item_name IS NOT NULL"
                    ).fetchall()
                    for r in rows:
                        _, l_id, i_name, c_at = r
                        if not i_name or not l_id:
                            continue
                        d_str = str(c_at)[:10]
                        a_key = i_name.strip().lower()
                        dup = conn.exec_driver_sql(
                            "SELECT id FROM purchase_events WHERE list_id = ? AND article_key = ? AND purchased_date = ?",
                            (l_id, a_key, d_str)
                        ).first()
                        if not dup:
                            conn.exec_driver_sql(
                                "INSERT INTO purchase_events (id, list_id, article_key, display_name, category, purchased_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                                (generate_uuid(), l_id, a_key, i_name.strip(), "Sonstiges", d_str, c_at)
                            )
            except Exception as bf_err:
                print(f"Backfill purchase_events notice: {bf_err}")

            conn.commit()
    except Exception as e:
        print(f"ensure_columns error (ignored): {e}")

ensure_columns()

app = FastAPI(title="KaufSync API", version="1.0.0")

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")
VAPID_CLAIMS = {"sub": "mailto:admin@kaufsync.com"}

def init_vapid_keys():
    global VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY
    if VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY:
        return
    vapid_file = os.path.join(os.getenv("DATA_DIR", "."), ".vapid_keys.json")
    if os.path.exists(vapid_file):
        try:
            with open(vapid_file, "r") as f:
                data = json.load(f)
                VAPID_PRIVATE_KEY = data.get("private_key")
                VAPID_PUBLIC_KEY = data.get("public_key")
        except Exception:
            pass
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        try:
            from pywebpush import Vapid
            import base64
            from cryptography.hazmat.primitives import serialization
            v = Vapid()
            v.generate_keys()
            priv_pem = v.private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            ).decode('utf-8')
            pub_der = v.public_key.public_bytes(
                encoding=serialization.Encoding.X962,
                format=serialization.PublicFormat.UncompressedPoint
            )
            pub_b64 = base64.urlsafe_b64encode(pub_der).decode('utf-8').rstrip('=')
            VAPID_PRIVATE_KEY = priv_pem
            VAPID_PUBLIC_KEY = pub_b64
            with open(vapid_file, "w") as f:
                json.dump({"private_key": VAPID_PRIVATE_KEY, "public_key": VAPID_PUBLIC_KEY}, f)
            print("Auto-generated VAPID keys successfully.")
        except Exception as e:
            print(f"Could not auto-generate VAPID keys: {e}")

init_vapid_keys()

def is_in_quiet_hours(user: models.User) -> bool:
    if not getattr(user, 'settings_push_quiet_hours', False):
        return False
    try:
        now = datetime.now()
        start_str = getattr(user, 'settings_push_quiet_start', '22:00') or '22:00'
        end_str = getattr(user, 'settings_push_quiet_end', '07:00') or '07:00'
        sh, sm = map(int, start_str.split(':'))
        eh, em = map(int, end_str.split(':'))
        current_time = now.hour * 60 + now.minute
        start_time = sh * 60 + sm
        end_time = eh * 60 + em
        if start_time <= end_time:
            return start_time <= current_time <= end_time
        else:
            return current_time >= start_time or current_time <= end_time
    except Exception:
        return False

def is_user_push_enabled(user: models.User, setting_name: str) -> bool:
    """Prüft, ob Push für einen Nutzer und ein bestimmtes Event aktiv ist. None/Default wird als True gewertet."""
    if not user:
        return False
    if getattr(user, 'settings_push_async_events', True) is False:
        return False
    if getattr(user, setting_name, True) is False:
        return False
    if is_in_quiet_hours(user):
        return False
    return True

def send_push_notification(subscription_info: dict, payload: dict):
    if not VAPID_PRIVATE_KEY:
        init_vapid_keys()
    if not VAPID_PRIVATE_KEY:
        print("VAPID private key is missing; push notification skipped.")
        return
    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=VAPID_CLAIMS
        )
    except WebPushException as ex:
        print("WebPushException:", repr(ex))
        if ex.response and ex.response.json():
            print("Remote push service replied:", ex.response.json())
    except Exception as e:
        print("Error sending push notification:", e)

# --- CORS KONFIGURATION ---
cors_origins_env = os.getenv("CORS_ORIGINS", "")
allowed_origins = [
    "http://localhost:5173",       # Vite Dev Server
    "https://localhost",           # Capacitor Android Default WebView Origin
    "capacitor://localhost",       # Capacitor iOS & alternativer Scheme
    "http://localhost",            # Lokaler Test
]
if cors_origins_env:
    for origin in cors_origins_env.split(","):
        stripped = origin.strip()
        if stripped and stripped not in allowed_origins:
            allowed_origins.append(stripped)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],  # Erlaubt alle Methoden (GET, POST, etc.)
    allow_headers=["*"],  # Erlaubt alle Header
)

# --- WEBSOCKET MANAGER ---
class ConnectionManager:
    def __init__(self):
        # Speichert aktive Verbindungen pro Einkaufsliste (list_id)
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # Speichert aktive Verbindungen pro User (user_id)
        self.user_active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, list_id: str):
        await websocket.accept()
        if list_id not in self.active_connections:
            self.active_connections[list_id] = []
        self.active_connections[list_id].append(websocket)

    def disconnect(self, websocket: WebSocket, list_id: str):
        if list_id in self.active_connections:
            self.active_connections[list_id].remove(websocket)

    async def broadcast(self, list_id: str, message: dict):
        if list_id in self.active_connections:
            for connection in self.active_connections[list_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

    async def broadcast_to_list(self, list_id: str, message: dict):
        await self.broadcast(list_id, message)

    async def connect_user(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.user_active_connections:
            self.user_active_connections[user_id] = []
        self.user_active_connections[user_id].append(websocket)

    def disconnect_user(self, websocket: WebSocket, user_id: str):
        if user_id in self.user_active_connections:
            self.user_active_connections[user_id].remove(websocket)

    async def broadcast_user(self, user_id: str, message: dict):
        if user_id in self.user_active_connections:
            for connection in self.user_active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

manager = ConnectionManager()

# --- WEBSOCKET ENDPUNKTE (MIT AUTH & BERECHTIGUNGSPRÜFUNG) ---
@app.websocket("/ws/{list_id}")
async def websocket_endpoint(websocket: WebSocket, list_id: str, token: Optional[str] = Query(None)):
    db = SessionLocal()
    try:
        user = auth.get_user_from_token(token, db) if token else None
        if not user or user.status != "active":
            await websocket.close(code=4001, reason="Nicht authentifiziert")
            return

        db_list = db.query(models.List).filter(models.List.id == list_id).first()
        if not db_list or (db_list.created_by != user.id and user not in db_list.members):
            await websocket.close(code=4003, reason="Keine Berechtigung für diese Liste")
            return

        await manager.connect(websocket, list_id)
        while True:
            # Verbindung offen halten und auf Disconnects warten
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, list_id)
    finally:
        db.close()


@app.websocket("/ws/user/{user_id}")
async def user_websocket_endpoint(websocket: WebSocket, user_id: str, token: Optional[str] = Query(None)):
    db = SessionLocal()
    try:
        user = auth.get_user_from_token(token, db) if token else None
        if not user or user.status != "active" or user.id != user_id:
            await websocket.close(code=4001, reason="Nicht authentifiziert")
            return

        await manager.connect_user(websocket, user_id)
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_user(websocket, user_id)
    finally:
        db.close()

# --- REST ENDPUNKTE ---
@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "KaufSync Backend läuft!"}
    
# --- AUTHENTIFIZIERUNG ---

from fastapi import BackgroundTasks

@app.post("/api/auth/register", response_model=schemas.UserResponse)
def register(user_data: schemas.UserCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    # Prüfen ob Email schon existiert
    db_user = db.query(models.User).filter(models.User.email == user_data.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="E-Mail bereits registriert")
        
    hashed_password = auth.get_password_hash(user_data.password)

    user_count = db.query(models.User).count()
    is_first_user = (user_count == 0)

    new_user = models.User(
        email=user_data.email, 
        password_hash=hashed_password, 
        display_name=user_data.display_name,
        is_admin=is_first_user,
        status="active" if is_first_user else "pending"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    if new_user.status == "pending":
        admins = db.query(models.User).filter(
            models.User.is_admin == True,
            models.User.settings_push_admin_pending_users == True
        ).all()

        for admin in admins:
            # Create notification
            notification = models.Notification(
                user_id=admin.id,
                title="Neuer Nutzer wartet auf Freigabe",
                body=f"Der Nutzer {new_user.display_name} hat sich registriert und wartet auf Freigabe.",
                action_url="/admin"
            )
            db.add(notification)

            # Send push notification
            subscriptions = db.query(models.PushSubscription).filter(models.PushSubscription.user_id == admin.id).all()
            for sub in subscriptions:
                sub_info = {
                    "endpoint": sub.endpoint,
                    "keys": {
                        "p256dh": sub.p256dh,
                        "auth": sub.auth
                    }
                }
                payload = {
                    "title": notification.title,
                    "body": notification.body,
                    "url": notification.action_url
                }
                background_tasks.add_task(send_push_notification, sub_info, payload)
        db.commit()

    return new_user

@app.post("/api/auth/login")
def login(login_data: schemas.LoginRequest, db: Session = Depends(get_db)):
    # User suchen
    user = db.query(models.User).filter(models.User.email == login_data.email).first()
    if not user or not auth.verify_password(login_data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Falsche E-Mail oder Passwort")

    # Status prüfen (pending/locked)
    if user.status != "active":
        if user.status == "pending":
            raise HTTPException(status_code=403, detail="Dein Benutzerkonto wartet noch auf Freischaltung durch einen Administrator.")
        elif user.status == "locked":
            raise HTTPException(status_code=403, detail="Dein Benutzerkonto wurde gesperrt.")
        else:
            raise HTTPException(status_code=403, detail="Konto nicht aktiv.")
    
    # Token generieren
    access_token = auth.create_access_token(
        data={"sub": user.id}, 
        expires_delta=timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    # NEU: Token direkt als JSON zurückgeben (nicht als Cookie)
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": {"id": user.id, "name": user.display_name, "status": user.status}
    }
# --- ADMIN ENDPUNKTE ---
def get_admin_user(current_user: models.User = Depends(auth.get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Keine Admin-Rechte")
    return current_user

@app.get("/api/push/public-key")
def get_push_public_key():
    if not VAPID_PUBLIC_KEY:
        init_vapid_keys()
    return {"public_key": VAPID_PUBLIC_KEY}

@app.get("/api/admin/stats")
def get_admin_stats(db: Session = Depends(get_db), admin: models.User = Depends(get_admin_user)):
    list_count = db.query(models.List).count()
    user_count = db.query(models.User).count()
    item_count = db.query(models.Item).count()

    # Optional: fetch user list for the admin view to display beneath stats
    users = db.query(models.User).all()

    return {
        "lists": list_count,
        "users": user_count,
        "items": item_count,
        "user_list": [{"id": u.id, "email": u.email, "display_name": u.display_name, "is_admin": u.is_admin, "status": u.status} for u in users]
    }

class UserRoleUpdate(BaseModel):
    is_admin: bool

@app.patch("/api/admin/users/{user_id}/role")
def change_user_role(user_id: str, payload: UserRoleUpdate, db: Session = Depends(get_db), admin: models.User = Depends(get_admin_user)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Du kannst deine eigenen Rechte nicht entziehen.")
    user.is_admin = payload.is_admin
    db.commit()
    return {"status": "ok", "message": f"{user.display_name} ist nun {'Admin' if user.is_admin else 'kein Admin mehr'}."}

from pydantic import BaseModel

class UserStatusUpdate(BaseModel):
    status: str

@app.patch("/api/admin/users/{user_id}/status")
def change_user_status(user_id: str, payload: UserStatusUpdate, db: Session = Depends(get_db), admin: models.User = Depends(get_admin_user)):
    if payload.status not in ["pending", "active", "locked"]:
        raise HTTPException(status_code=400, detail="Ungültiger Status")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    if user.id == admin.id and payload.status != "active":
        raise HTTPException(status_code=400, detail="Du kannst dich nicht selbst sperren.")
    user.status = payload.status
    db.commit()
    return {"status": "ok", "message": f"Status von {user.display_name} geändert auf {payload.status}."}

@app.post("/api/admin/users/{user_id}/reset-password")
def admin_generate_reset_token(user_id: str, db: Session = Depends(get_db), admin: models.User = Depends(get_admin_user)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    import secrets
    from datetime import datetime, timedelta

    # Invalide alte Tokens
    db.query(models.PasswordResetToken).filter(models.PasswordResetToken.user_id == user.id).update({"is_used": True})

    plain_token = secrets.token_urlsafe(32)

    token_entry = models.PasswordResetToken(
        user_id=user.id,
        token=auth.get_password_hash(plain_token),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24)
    )
    db.add(token_entry)
    db.commit()

    # Der Link enthält nun die user_id und den Token
    return {"status": "ok", "reset_link": f"/reset-password?user_id={user.id}&token={plain_token}"}

class ResetPasswordConfirm(BaseModel):
    user_id: str
    token: str
    new_password: str

@app.post("/api/auth/reset-password")
def reset_password(payload: ResetPasswordConfirm, db: Session = Depends(get_db)):
    now_utc = datetime.now(timezone.utc)
    tokens = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.user_id == payload.user_id,
        models.PasswordResetToken.is_used == False,
        models.PasswordResetToken.expires_at > now_utc
    ).all()

    valid_token = None
    for t in tokens:
        if auth.verify_password(payload.token, t.token):
            valid_token = t
            break

    if not valid_token:
        raise HTTPException(status_code=400, detail="Ungültiger oder abgelaufener Token")

    user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    user.password_hash = auth.get_password_hash(payload.new_password)
    valid_token.is_used = True
    db.commit()

    return {"status": "ok", "message": "Passwort erfolgreich zurückgesetzt"}

# --- USER ENDPUNKTE ---

class UserUpdate(BaseModel):
    display_name: str
    settings_push_async_events: bool | None = None
    settings_push_new_items: bool | None = None
    settings_push_admin_pending_users: bool | None = None

class PasswordUpdate(BaseModel):
    old_password: str
    new_password: str

@app.get("/api/users/search", response_model=list[schemas.UserPublicResponse])
def search_users(
    q: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Sucht Benutzer nach E-Mail oder Anzeigename, exklusive dem aktuellen Benutzer."""
    if not q or len(q) < 2:
        return []

    search_term = f"%{q}%"
    users = db.query(models.User).filter(
        (models.User.id != current_user.id) &
        ((models.User.email.ilike(search_term)) | (models.User.display_name.ilike(search_term)))
    ).limit(10).all()

    return users

@app.get("/api/users/me", response_model=schemas.UserResponse)
def get_current_user_profile(current_user: models.User = Depends(auth.get_current_user)):
    """Gibt die Profildaten des aktuell eingeloggten Nutzers zurück."""
    return current_user

@app.put("/api/users/me", response_model=schemas.UserResponse)
def update_user_profile(
    user_update: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Aktualisiert das Profil des Nutzers."""
    current_user.display_name = user_update.display_name
    fields = [
        'settings_push_async_events', 'settings_push_new_items', 'settings_push_completed_items',
        'settings_push_cleared_items', 'settings_push_shopping_started', 'settings_push_shopping_done',
        'settings_push_members', 'settings_push_quiet_hours', 'settings_push_quiet_start',
        'settings_push_quiet_end', 'settings_sound_enabled', 'settings_vibration_enabled',
        'settings_push_admin_pending_users', 'keep_screen_awake', 'haptic_feedback_enabled',
        'show_restock_suggestions'
    ]
    for f in fields:
        val = getattr(user_update, f, None)
        if val is not None:
            setattr(current_user, f, val)
    db.commit()
    db.refresh(current_user)
    return current_user

@app.get("/api/notifications", response_model=list[schemas.NotificationResponse])
def get_notifications(unread_only: bool = False, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    q = db.query(models.Notification).filter(models.Notification.user_id == current_user.id)
    if unread_only:
        q = q.filter(models.Notification.is_read == False)
    return q.order_by(models.Notification.created_at.desc()).limit(50).all()

@app.patch("/api/notifications/{notification_id}/read")
def read_notification(notification_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    notification = db.query(models.Notification).filter(models.Notification.id == notification_id, models.Notification.user_id == current_user.id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.is_read = True
    db.commit()
    return {"status": "ok"}

@app.post("/api/notifications/mark-all-read")
def mark_all_notifications_read(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db.query(models.Notification).filter(models.Notification.user_id == current_user.id, models.Notification.is_read == False).update({"is_read": True})
    db.commit()
    return {"status": "ok"}

@app.post("/api/push/subscribe")
def subscribe_push(sub_data: schemas.PushSubscriptionCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    # Check if subscription already exists for endpoint
    existing = db.query(models.PushSubscription).filter(
        models.PushSubscription.user_id == current_user.id,
        models.PushSubscription.endpoint == sub_data.endpoint
    ).first()
    if not existing:
        new_sub = models.PushSubscription(
            user_id=current_user.id,
            endpoint=sub_data.endpoint,
            p256dh=sub_data.p256dh,
            auth=sub_data.auth
        )
        db.add(new_sub)
        db.commit()
    else:
        existing.p256dh = sub_data.p256dh
        existing.auth = sub_data.auth
        db.commit()
    return {"status": "ok"}

@app.post("/api/push/test")
def test_push_notification(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    notif = models.Notification(
        user_id=current_user.id,
        title="KaufSync Test",
        body="Benachrichtigungen funktionieren einwandfrei! 🎉",
        action_url="/"
    )
    db.add(notif)
    db.commit()
    subs = db.query(models.PushSubscription).filter(models.PushSubscription.user_id == current_user.id).all()
    for sub in subs:
        background_tasks.add_task(
            send_push_notification,
            {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
            {"title": notif.title, "body": notif.body, "url": notif.action_url}
        )
    return {"status": "ok", "subscriptions_count": len(subs), "message": "Testbenachrichtigung gesendet"}

@app.put("/api/users/me/password")
def change_password(
    password_data: PasswordUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Ändert das Passwort des Nutzers nach erfolgreicher Überprüfung des alten Passworts."""
    # Altes Passwort verifizieren
    if not auth.verify_password(password_data.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Das alte Passwort ist inkorrekt")
    
    # Neues Passwort hashen und speichern
    current_user.password_hash = auth.get_password_hash(password_data.new_password)
    db.commit()
    return {"status": "ok", "message": "Passwort erfolgreich geändert"}

@app.delete("/api/users/me")
def delete_account(
    req: schemas.DeleteAccountRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Löscht das Benutzerkonto dauerhaft und unwiderruflich nach Passwortprüfung."""
    # 1. Passwort prüfen
    if not auth.verify_password(req.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Das eingegebene Passwort ist nicht korrekt.")

    # 2. Schutz vor Löschung des einzigen Administrators
    if current_user.is_admin:
        admin_count = db.query(models.User).filter(models.User.is_admin == True).count()
        if admin_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="Du bist der einzige Administrator. Bitte ernenne zuerst einen anderen Administrator, bevor du dein Konto löschst."
            )

    user_id = current_user.id

    # 3. Eigene Listen behandeln (Übertragen oder Löschen)
    created_lists = db.query(models.List).filter(models.List.created_by == user_id).all()
    for l in created_lists:
        remaining_members = [m for m in l.members if m.id != user_id]
        if remaining_members:
            # An das dienstälteste verbleibende Mitglied übertragen
            longest_standing = min(remaining_members, key=lambda u: u.created_at or datetime.max)
            l.created_by = longest_standing.id
        else:
            # Keine weiteren Mitglieder: Liste komplett löschen
            db.query(models.Item).filter(models.Item.list_id == l.id).delete(synchronize_session=False)
            db.query(models.ActivityLog).filter(models.ActivityLog.list_id == l.id).delete(synchronize_session=False)
            db.query(models.ListInvitation).filter(models.ListInvitation.list_id == l.id).delete(synchronize_session=False)
            db.query(models.ListJoinRequest).filter(models.ListJoinRequest.list_id == l.id).delete(synchronize_session=False)
            db.query(models.ListLoyaltyCard).filter(models.ListLoyaltyCard.list_id == l.id).delete(synchronize_session=False)
            db.query(models.PurchaseEvent).filter(models.PurchaseEvent.list_id == l.id).delete(synchronize_session=False)
            db.query(models.SuggestionSnooze).filter(models.SuggestionSnooze.list_id == l.id).delete(synchronize_session=False)
            db.delete(l)

    # 4. Nutzer aus allen Mitgliedschaften austragen
    db.execute(models.list_members.delete().where(models.list_members.c.user_id == user_id))

    # 5. Nutzer in verbleibenden Aktivitäts-Logs und Items anonymisieren
    db.query(models.ActivityLog).filter(models.ActivityLog.user_id == user_id).update(
        {models.ActivityLog.user_id: None}, synchronize_session=False
    )
    db.query(models.Item).filter(models.Item.last_modified_by == user_id).update(
        {models.Item.last_modified_by: None}, synchronize_session=False
    )

    # 6. Verknüpfte Einträge des Nutzers löschen
    db.query(models.ListInvitation).filter(
        (models.ListInvitation.inviter_id == user_id) | (models.ListInvitation.invitee_id == user_id)
    ).delete(synchronize_session=False)
    db.query(models.ListJoinRequest).filter(models.ListJoinRequest.user_id == user_id).delete(synchronize_session=False)
    db.query(models.PasswordResetToken).filter(models.PasswordResetToken.user_id == user_id).delete(synchronize_session=False)
    db.query(models.Notification).filter(models.Notification.user_id == user_id).delete(synchronize_session=False)
    db.query(models.PushSubscription).filter(models.PushSubscription.user_id == user_id).delete(synchronize_session=False)
    db.query(models.ListLoyaltyCard).filter(models.ListLoyaltyCard.user_id == user_id).delete(synchronize_session=False)

    # 7. Nutzer löschen
    db.delete(current_user)
    db.commit()

    return {"status": "ok", "message": "Konto wurde dauerhaft gelöscht."}
    
# --- GESCHÜTZTE DATEN-ENDPUNKTE ---

@app.post("/api/lists", response_model=schemas.ListResponse)
async def create_list(
    list_data: schemas.ListCreate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user) # SCHUTZ
):
    # Check if a list with the same name already exists for the user
    existing_list = db.query(models.List).filter(
        models.List.name == list_data.name,
        ((models.List.created_by == current_user.id) | (models.List.members.any(id=current_user.id)))
    ).first()
    if existing_list:
        return existing_list

    new_list = models.List(
        name=list_data.name, 
        icon_name=list_data.icon_name,
        created_by=current_user.id # Liste an User binden
    )
    db.add(new_list)
    db.commit()
    db.refresh(new_list)
    await manager.broadcast_user(str(current_user.id), {
        "event": "LIST_UPDATED"
    })
    return new_list

@app.get("/api/lists", response_model=list[schemas.ListResponse])
def get_lists(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    # Lade Listen, die der User selbst erstellt hat ODER in die er eingeladen wurde
    return db.query(models.List).filter(
        (models.List.created_by == current_user.id) | 
        (models.List.members.any(id=current_user.id))
    ).all()

@app.get("/api/invitations", response_model=list[schemas.ListInvitationResponse])
def get_invitations(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Gibt alle offenen Einladungen für den aktuellen Benutzer zurück."""
    invitations = db.query(models.ListInvitation).filter(
        models.ListInvitation.invitee_id == current_user.id,
        models.ListInvitation.status == "pending"
    ).all()

    # Optional fields anreichern
    for inv in invitations:
        inv.list_name = inv.list.name
        inv.inviter_name = inv.inviter.display_name

    return invitations

@app.delete("/api/lists/{list_id}")
async def delete_list(
    list_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_list = db.query(models.List).filter(models.List.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")

    # Berechtigung prüfen: Nur Ersteller oder Mitglieder dürfen Items anlegen
    if db_list.created_by != current_user.id and current_user not in db_list.members:
        raise HTTPException(status_code=403, detail="Keine Berechtigung für diese Liste")
        
    # Nur der Ersteller darf die Liste komplett löschen
    if db_list.created_by != current_user.id:
        # Alternativ: Nur Mitgliedschaft aufheben
        if current_user in db_list.members:
            db_list.members.remove(current_user)
            db.query(models.ListLoyaltyCard).filter(
                models.ListLoyaltyCard.list_id == list_id,
                models.ListLoyaltyCard.user_id == current_user.id
            ).delete(synchronize_session=False)
            db.commit()
            await manager.broadcast_user(str(current_user.id), {
                "event": "LIST_UPDATED"
            })
            return {"status": "ok", "message": "Liste verlassen"}
        raise HTTPException(status_code=403, detail="Keine Berechtigung")
        
    db.query(models.ListLoyaltyCard).filter(models.ListLoyaltyCard.list_id == list_id).delete(synchronize_session=False)
    db.query(models.PurchaseEvent).filter(models.PurchaseEvent.list_id == list_id).delete(synchronize_session=False)
    db.query(models.SuggestionSnooze).filter(models.SuggestionSnooze.list_id == list_id).delete(synchronize_session=False)
    db.delete(db_list)
    db.commit()

    await manager.broadcast_user(str(current_user.id), {
        "event": "LIST_UPDATED"
    })

    return {"status": "ok", "message": "Liste erfolgreich gelöscht"}

# --- LOYALTY CARDS ENDPOINTS ---

@app.get("/api/loyalty-cards", response_model=List[schemas.LoyaltyCardResponse])
def get_user_loyalty_cards(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Liefert alle hinterlegten Bonuskarten des aktuell eingeloggten Nutzers."""
    cards = db.query(models.ListLoyaltyCard).filter(
        models.ListLoyaltyCard.user_id == current_user.id
    ).all()
    return cards

@app.get("/api/lists/{list_id}/loyalty-card", response_model=Optional[schemas.LoyaltyCardResponse])
def get_list_loyalty_card(
    list_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Liefert die für diese Liste hinterlegte persönliche Bonuskarte des Nutzers."""
    card = db.query(models.ListLoyaltyCard).filter(
        models.ListLoyaltyCard.user_id == current_user.id,
        models.ListLoyaltyCard.list_id == list_id
    ).first()
    return card

@app.put("/api/lists/{list_id}/loyalty-card", response_model=schemas.LoyaltyCardResponse)
def upsert_list_loyalty_card(
    list_id: str,
    payload: schemas.LoyaltyCardCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Hinterlegt oder aktualisiert die Bonuskarte für eine Liste (1:1 pro Nutzer & Liste)."""
    db_list = db.query(models.List).filter(models.List.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")
    if db_list.created_by != current_user.id and current_user not in db_list.members:
        raise HTTPException(status_code=403, detail="Keine Berechtigung für diese Liste")

    if not payload.code_value or not payload.code_value.strip():
        raise HTTPException(status_code=400, detail="Code-Wert darf nicht leer sein")

    code_format = (payload.code_format or "CODE_128").upper().strip()

    card = db.query(models.ListLoyaltyCard).filter(
        models.ListLoyaltyCard.user_id == current_user.id,
        models.ListLoyaltyCard.list_id == list_id
    ).first()

    now = datetime.now(timezone.utc)
    if card:
        card.code_value = payload.code_value.strip()
        card.code_format = code_format
        card.updated_at = now
    else:
        card = models.ListLoyaltyCard(
            id=models.generate_uuid(),
            user_id=current_user.id,
            list_id=list_id,
            code_value=payload.code_value.strip(),
            code_format=code_format,
            created_at=now,
            updated_at=now
        )
        db.add(card)

    db.commit()
    db.refresh(card)
    return card

@app.delete("/api/lists/{list_id}/loyalty-card")
def delete_list_loyalty_card(
    list_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Löscht die hinterlegte Bonuskarte für die angegebene Liste."""
    card = db.query(models.ListLoyaltyCard).filter(
        models.ListLoyaltyCard.user_id == current_user.id,
        models.ListLoyaltyCard.list_id == list_id
    ).first()
    if not card:
        return {"status": "ok", "message": "Keine Bonuskarte vorhanden"}

    db.delete(card)
    db.commit()
    return {"status": "ok", "message": "Bonuskarte gelöscht"}

# --- CONSUMPTION CYCLES & SUGGESTIONS ---

def format_cadence_text(median_days: int) -> str:
    m = round(median_days)
    if m <= 1:
        return "Täglich"
    if m < 6:
        return f"Alle ~{m} Tage"
    if 6 <= m <= 8:
        return "Wöchentlich"
    if 12 <= m <= 16:
        return "Meist alle 2 Wochen"
    if 19 <= m <= 23:
        return "Meist alle 3 Wochen"
    if 27 <= m <= 35:
        return "Meist monatlich"
    if m > 35 and m % 7 <= 2:
        return f"Alle ~{round(m / 7)} Wochen"
    return f"Alle ~{m} Tage"

def calculate_median(numbers: List[int]) -> int:
    if not numbers:
        return 0
    s = sorted(numbers)
    mid = len(s) // 2
    if len(s) % 2 != 0:
        return s[mid]
    return round((s[mid - 1] + s[mid]) / 2)

def record_purchase_event(db: Session, list_id: str, item_name: str, category: str = "Sonstiges", source_item_id: Optional[str] = None):
    if not list_id or not item_name:
        return
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    article_key = item_name.strip().lower()
    existing = db.query(models.PurchaseEvent).filter(
        models.PurchaseEvent.list_id == list_id,
        models.PurchaseEvent.article_key == article_key,
        models.PurchaseEvent.purchased_date == today_str
    ).first()
    if not existing:
        pe = models.PurchaseEvent(
            list_id=list_id,
            article_key=article_key,
            display_name=item_name.strip(),
            category=category or "Sonstiges",
            purchased_date=today_str,
            source_item_id=source_item_id
        )
        db.add(pe)
    # Clear active snoozes for this article in this list
    db.query(models.SuggestionSnooze).filter(
        models.SuggestionSnooze.list_id == list_id,
        models.SuggestionSnooze.article_key == article_key
    ).delete(synchronize_session=False)

def retract_purchase_event(db: Session, list_id: str, source_item_id: str):
    if not list_id or not source_item_id:
        return
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    db.query(models.PurchaseEvent).filter(
        models.PurchaseEvent.list_id == list_id,
        models.PurchaseEvent.source_item_id == source_item_id,
        models.PurchaseEvent.purchased_date == today_str
    ).delete(synchronize_session=False)

@app.get("/api/lists/{list_id}/purchases", response_model=List[schemas.PurchaseEventResponse])
def get_list_purchases(
    list_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_list = db.query(models.List).filter(models.List.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")
    if db_list.created_by != current_user.id and current_user not in db_list.members:
        raise HTTPException(status_code=403, detail="Keine Berechtigung")

    events = db.query(models.PurchaseEvent).filter(
        models.PurchaseEvent.list_id == list_id
    ).order_by(models.PurchaseEvent.purchased_date.desc()).all()
    return events

@app.get("/api/lists/{list_id}/suggestions", response_model=List[schemas.DueSuggestionResponse])
def get_due_suggestions(
    list_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_list = db.query(models.List).filter(models.List.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")
    if db_list.created_by != current_user.id and current_user not in db_list.members:
        raise HTTPException(status_code=403, detail="Keine Berechtigung")

    if hasattr(current_user, 'show_restock_suggestions') and not current_user.show_restock_suggestions:
        return []

    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")

    active_items = db.query(models.Item).filter(
        models.Item.list_id == list_id,
        models.Item.status != "completed",
        models.Item.is_deleted == False
    ).all()
    active_keys = {item.name.strip().lower() for item in active_items if item.name}

    snoozes = db.query(models.SuggestionSnooze).filter(
        models.SuggestionSnooze.list_id == list_id,
        models.SuggestionSnooze.snoozed_until > now
    ).all()
    snoozed_keys = {s.article_key.lower() for s in snoozes}

    events = db.query(models.PurchaseEvent).filter(
        models.PurchaseEvent.list_id == list_id
    ).all()

    grouped = {}
    for ev in events:
        ak = ev.article_key.lower()
        if ak not in grouped:
            grouped[ak] = {
                "article_key": ev.article_key,
                "display_name": ev.display_name,
                "category": ev.category or "Sonstiges",
                "icon": ev.icon,
                "dates": set()
            }
        grouped[ak]["dates"].add(ev.purchased_date)
        if ev.display_name:
            grouped[ak]["display_name"] = ev.display_name
        if ev.category and ev.category != "Sonstiges":
            grouped[ak]["category"] = ev.category
        if ev.icon:
            grouped[ak]["icon"] = ev.icon

    today_date = datetime.strptime(today_str, "%Y-%m-%d").date()
    suggestions = []

    for ak, data in grouped.items():
        if ak in active_keys or data["display_name"].lower() in active_keys:
            continue
        if ak in snoozed_keys or data["display_name"].lower() in snoozed_keys:
            continue

        unique_dates = sorted(list(data["dates"]))
        if len(unique_dates) < 3:
            continue

        recent_dates = unique_dates[-12:]
        intervals = []
        for i in range(len(recent_dates) - 1):
            d1 = datetime.strptime(recent_dates[i], "%Y-%m-%d").date()
            d2 = datetime.strptime(recent_dates[i + 1], "%Y-%m-%d").date()
            diff = (d2 - d1).days
            if 1 <= diff <= 180:
                intervals.append(diff)

        if len(intervals) < 2:
            continue

        median_cycle = max(1, calculate_median(intervals))
        last_date_str = recent_dates[-1]
        last_date = datetime.strptime(last_date_str, "%Y-%m-%d").date()
        days_since = (today_date - last_date).days

        if days_since < 1:
            continue

        if days_since < (median_cycle * 0.85):
            continue

        max_stale = max(median_cycle * 3, 60)
        if days_since > max_stale:
            continue

        urgency_score = days_since / median_cycle
        suggestions.append({
            "article_key": data["article_key"],
            "display_name": data["display_name"],
            "category": data["category"],
            "icon": data["icon"],
            "median_cycle_days": median_cycle,
            "days_since_last_purchase": days_since,
            "urgency_score": urgency_score,
            "last_purchased_at": last_date_str,
            "cadence_text": format_cadence_text(median_cycle)
        })

    suggestions.sort(key=lambda s: s["urgency_score"], reverse=True)
    return suggestions[:10]

@app.post("/api/lists/{list_id}/suggestions/snooze")
def snooze_suggestion(
    list_id: str,
    req: schemas.SnoozeRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_list = db.query(models.List).filter(models.List.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")
    if db_list.created_by != current_user.id and current_user not in db_list.members:
        raise HTTPException(status_code=403, detail="Keine Berechtigung")

    days = req.days if req.days and req.days > 0 else 3
    snoozed_until = datetime.now(timezone.utc) + timedelta(days=days)
    ak = req.article_key.strip().lower()

    existing = db.query(models.SuggestionSnooze).filter(
        models.SuggestionSnooze.list_id == list_id,
        models.SuggestionSnooze.article_key == ak
    ).first()
    if existing:
        existing.snoozed_until = snoozed_until
    else:
        snooze = models.SuggestionSnooze(
            list_id=list_id,
            article_key=ak,
            snoozed_until=snoozed_until
        )
        db.add(snooze)
    db.commit()
    return {"status": "ok", "snoozed_until": snoozed_until.isoformat()}

# --- READONLY PUBLIC SHARING ---

@app.get("/api/public/list/{readonly_token}", response_model=schemas.PublicListResponse)
def get_public_list(
    readonly_token: str,
    db: Session = Depends(get_db)
):
    """Öffentlich zugängliche Nur-Lesen-Ansicht einer Einkaufsliste."""
    if not readonly_token or len(readonly_token) < 10:
        raise HTTPException(status_code=404, detail="Ungültiger Freigabelink")

    db_list = db.query(models.List).filter(
        models.List.readonly_token == readonly_token,
        models.List.readonly_enabled == True
    ).first()

    if not db_list:
        raise HTTPException(
            status_code=404,
            detail="Diese Liste ist nicht öffentlich freigegeben oder der Link wurde deaktiviert."
        )

    # Nur aktive (nicht gelöschte) Items
    active_items = [
        item for item in db_list.items 
        if not getattr(item, "is_deleted", False)
    ]

    return {
        "id": db_list.id,
        "name": db_list.name,
        "icon_name": db_list.icon_name,
        "created_at": db_list.created_at,
        "items": active_items
    }

@app.post("/api/lists/{list_id}/readonly-link", response_model=schemas.ReadonlyLinkResponse)
def manage_readonly_link(
    list_id: str,
    payload: Optional[schemas.ReadonlyLinkToggleRequest] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Aktiviert oder verwaltet den Nur-Lesen Link einer Liste (nur Besitzer/Admin)."""
    db_list = db.query(models.List).filter(models.List.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")

    if db_list.created_by != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Nur der Listenbesitzer kann den Nur-Lesen Link verwalten.")

    # Generiere Token falls noch keiner existiert
    if not db_list.readonly_token:
        db_list.readonly_token = secrets.token_urlsafe(24)

    if payload and payload.enabled is not None:
        db_list.readonly_enabled = payload.enabled
    else:
        db_list.readonly_enabled = not db_list.readonly_enabled

    db.commit()
    db.refresh(db_list)
    return {
        "readonly_token": db_list.readonly_token,
        "readonly_enabled": db_list.readonly_enabled
    }

@app.delete("/api/lists/{list_id}/readonly-link", response_model=schemas.ReadonlyLinkResponse)
def disable_readonly_link(
    list_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Deaktiviert den Nur-Lesen Link einer Liste."""
    db_list = db.query(models.List).filter(models.List.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")

    if db_list.created_by != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Nur der Listenbesitzer kann den Nur-Lesen Link verwalten.")

    db_list.readonly_enabled = False
    db.commit()
    db.refresh(db_list)
    return {
        "readonly_token": db_list.readonly_token,
        "readonly_enabled": False
    }

@app.post("/api/lists/join")
async def join_list(
    join_data: schemas.JoinListRequest, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    # Liste anhand des Codes suchen
    db_list = db.query(models.List).filter(models.List.share_code == join_data.share_code.upper()).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="Ungültiger Einladungs-Link")
        
    # Prüfen ob man schon Mitglied oder sogar Besitzer ist
    if current_user.id == db_list.created_by or any(m.id == current_user.id for m in db_list.members):
        return {
            "status": "already_member",
            "list_id": db_list.id,
            "list_name": db_list.name,
            "message": "Du bist bereits Mitglied dieser Liste."
        }

    # Prüfen ob bereits eine offene Anfrage vorliegt
    existing_req = db.query(models.ListJoinRequest).filter(
        models.ListJoinRequest.list_id == db_list.id,
        models.ListJoinRequest.user_id == current_user.id,
        models.ListJoinRequest.status == "pending"
    ).first()
    if existing_req:
        return {
            "status": "pending_approval",
            "list_id": db_list.id,
            "list_name": db_list.name,
            "message": "Deine Beitrittsanfrage wartet noch auf Freigabe durch den Besitzer."
        }

    # Neue Anfrage erstellen
    new_req = models.ListJoinRequest(
        list_id=db_list.id,
        user_id=current_user.id,
        status="pending"
    )
    db.add(new_req)
    db.commit()

    # Push Notification & WS an den Besitzer der Liste
    owner = db.query(models.User).filter(models.User.id == db_list.created_by).first()
    if owner and owner.id != current_user.id:
        notif = models.Notification(
            user_id=owner.id,
            title="Neue Beitrittsanfrage",
            body=f"{current_user.display_name} möchte der Liste '{db_list.name}' beitreten.",
            action_url=f"/list/{db_list.id}"
        )
        db.add(notif)
        db.commit()
        if owner.settings_push_async_events:
            subs = db.query(models.PushSubscription).filter(models.PushSubscription.user_id == owner.id).all()
            for sub in subs:
                background_tasks.add_task(
                    send_push_notification,
                    {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                    {"title": notif.title, "body": notif.body, "url": notif.action_url}
                )
        await manager.broadcast_user(str(owner.id), {
            "event": "JOIN_REQUEST_RECEIVED",
            "payload": {
                "list_id": db_list.id,
                "request_id": new_req.id,
                "user_name": current_user.display_name
            }
        })

    return {
        "status": "pending_approval",
        "list_id": db_list.id,
        "list_name": db_list.name,
        "message": "Beitrittsanfrage gesendet. Der Besitzer der Liste muss dich freischalten."
    }

@app.get("/api/lists/{list_id}/join-requests")
def get_join_requests(
    list_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_list = db.query(models.List).filter(models.List.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")
    if db_list.created_by != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Nur der Besitzer kann Beitrittsanfragen einsehen")

    requests = db.query(models.ListJoinRequest).filter(
        models.ListJoinRequest.list_id == list_id,
        models.ListJoinRequest.status == "pending"
    ).all()

    return [
        {
            "id": r.id,
            "user_id": r.user_id,
            "display_name": r.user.display_name if r.user else "Unbekannt",
            "email": r.user.email if r.user else "",
            "created_at": r.created_at.isoformat() if r.created_at else None
        }
        for r in requests
    ]

@app.post("/api/lists/{list_id}/join-requests/{request_id}/approve")
async def approve_join_request(
    list_id: str,
    request_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_list = db.query(models.List).filter(models.List.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")
    if db_list.created_by != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Nur der Besitzer kann Beitrittsanfragen genehmigen")

    join_req = db.query(models.ListJoinRequest).filter(
        models.ListJoinRequest.id == request_id,
        models.ListJoinRequest.list_id == list_id
    ).first()
    if not join_req:
        raise HTTPException(status_code=404, detail="Anfrage nicht gefunden")

    target_user = db.query(models.User).filter(models.User.id == join_req.user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Benutzer nicht mehr vorhanden")

    if target_user not in db_list.members:
        db_list.members.append(target_user)

    join_req.status = "approved"
    db.commit()

    # Benachrichtigung an den freigeschalteten Nutzer
    notif = models.Notification(
        user_id=target_user.id,
        title="Beitritt freigegeben",
        body=f"Du wurdest für die Liste '{db_list.name}' freigeschaltet!",
        action_url=f"/list/{db_list.id}"
    )
    db.add(notif)
    db.commit()

    if getattr(target_user, "settings_push_members", True) or getattr(target_user, "settings_push_async_events", True):
        subs = db.query(models.PushSubscription).filter(models.PushSubscription.user_id == target_user.id).all()
        for sub in subs:
            background_tasks.add_task(
                send_push_notification,
                {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                {"title": notif.title, "body": notif.body, "url": notif.action_url}
            )

    await manager.broadcast_user(str(target_user.id), {
        "event": "LIST_UPDATED"
    })
    await manager.broadcast(str(db_list.id), {
        "event": "MEMBER_JOINED",
        "payload": {"user_id": target_user.id, "display_name": target_user.display_name}
    })

    return {"status": "ok", "message": f"{target_user.display_name} wurde zur Liste hinzugefügt"}

@app.post("/api/lists/{list_id}/join-requests/{request_id}/reject")
async def reject_join_request(
    list_id: str,
    request_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_list = db.query(models.List).filter(models.List.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")
    if db_list.created_by != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Nur der Besitzer kann Beitrittsanfragen ablehnen")

    join_req = db.query(models.ListJoinRequest).filter(
        models.ListJoinRequest.id == request_id,
        models.ListJoinRequest.list_id == list_id
    ).first()
    if not join_req:
        raise HTTPException(status_code=404, detail="Anfrage nicht gefunden")

    join_req.status = "rejected"
    db.commit()

    return {"status": "ok", "message": "Anfrage abgelehnt"}

@app.post("/api/lists/{list_id}/invite", response_model=schemas.ListInvitationResponse)
def invite_user(
    list_id: str,
    invite_data: schemas.InviteUserRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Lädt einen Benutzer in eine Liste ein."""
    db_list = db.query(models.List).filter(models.List.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")

    # Nur Mitglieder oder Besitzer dürfen einladen
    if db_list.created_by != current_user.id and current_user not in db_list.members:
        raise HTTPException(status_code=403, detail="Keine Berechtigung")

    invitee = db.query(models.User).filter(models.User.id == invite_data.invitee_id).first()
    if not invitee:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    # Prüfen, ob der Benutzer bereits Mitglied ist
    if invitee.id == db_list.created_by or invitee in db_list.members:
        raise HTTPException(status_code=400, detail="Benutzer ist bereits Mitglied dieser Liste")

    # Prüfen, ob es bereits eine offene Einladung gibt
    existing_invite = db.query(models.ListInvitation).filter(
        models.ListInvitation.list_id == list_id,
        models.ListInvitation.invitee_id == invitee.id,
        models.ListInvitation.status == "pending"
    ).first()

    if existing_invite:
        raise HTTPException(status_code=400, detail="Es gibt bereits eine offene Einladung für diesen Benutzer")

    new_invite = models.ListInvitation(
        list_id=list_id,
        inviter_id=current_user.id,
        invitee_id=invitee.id
    )

    db.add(new_invite)
    db.commit()
    db.refresh(new_invite)

    new_invite.list_name = db_list.name
    new_invite.inviter_name = current_user.display_name

    return new_invite

@app.post("/api/invitations/{invite_id}/respond")
async def respond_to_invitation(
    invite_id: str,
    action: str, # "accept" oder "decline"
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Nimmt eine Einladung an oder lehnt sie ab."""
    invite = db.query(models.ListInvitation).filter(
        models.ListInvitation.id == invite_id,
        models.ListInvitation.invitee_id == current_user.id
    ).first()

    if not invite:
        raise HTTPException(status_code=404, detail="Einladung nicht gefunden")

    if invite.status != "pending":
        raise HTTPException(status_code=400, detail="Einladung wurde bereits beantwortet")

    if action == "accept":
        invite.status = "accepted"
        db_list = db.query(models.List).filter(models.List.id == invite.list_id).first()
        if db_list and current_user not in db_list.members:
            db_list.members.append(current_user)
    elif action == "decline":
        invite.status = "declined"
    else:
        raise HTTPException(status_code=400, detail="Ungültige Aktion")

    db.commit()

    if action == "accept":
        await manager.broadcast_user(str(current_user.id), {
            "event": "LIST_UPDATED"
        })

    return {"status": "ok", "message": f"Einladung {'angenommen' if action == 'accept' else 'abgelehnt'}"}

@app.post("/api/lists/{list_id}/items", response_model=schemas.ItemResponse)
async def create_item(
    list_id: str, 
    item_data: schemas.ItemCreate, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user) # SCHUTZ
):
    db_list = db.query(models.List).filter(models.List.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")

    # Berechtigung prüfen: Nur Ersteller oder Mitglieder dürfen Items anlegen
    if db_list.created_by != current_user.id and current_user not in db_list.members:
        raise HTTPException(status_code=403, detail="Keine Berechtigung für diese Liste")
        
    item_kwargs = {
        "list_id": list_id,
        "name": item_data.name,
        "category": item_data.category or "Sonstiges",
        "quantity": item_data.quantity,
        "unit": item_data.unit or "Stk",
        "note": item_data.note,
        "tags": item_data.tags,
        "last_modified_by": current_user.id,
        "updated_at": datetime.now(timezone.utc),
        "is_deleted": False
    }
    if item_data.id:
        existing = db.query(models.Item).filter(models.Item.id == item_data.id).first()
        if existing:
            for k, v in item_kwargs.items():
                setattr(existing, k, v)
            db.commit()
            db.refresh(existing)
            new_item = existing
        else:
            item_kwargs["id"] = item_data.id
            new_item = models.Item(**item_kwargs)
            db.add(new_item)
            db.commit()
            db.refresh(new_item)
    else:
        new_item = models.Item(**item_kwargs)
        db.add(new_item)
        db.commit()
        db.refresh(new_item)

    # LOG ACTIVITY
    log_entry = models.ActivityLog(
        list_id=list_id,
        user_id=current_user.id,
        action_type="added",
        item_name=new_item.name
    )
    db.add(log_entry)
    db.commit()

    # Push Notification für neue Items
    # Deduplicate members to prevent sending duplicate notifications to the creator
    members_list = db_list.members + ([db_list.creator] if db_list.creator else [])
    members = {member.id: member for member in members_list}.values()
    for member in members:
        if member.id != current_user.id:
            notif = models.Notification(
                user_id=member.id,
                title="Neuer Artikel",
                body=f"{current_user.display_name} hat {new_item.name} zu '{db_list.name}' hinzugefügt.",
                action_url=f"/list/{db_list.id}"
            )
            db.add(notif)
            if is_user_push_enabled(member, 'settings_push_new_items'):
                subs = db.query(models.PushSubscription).filter(models.PushSubscription.user_id == member.id).all()
                for sub in subs:
                    background_tasks.add_task(
                        send_push_notification,
                        {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                        {"title": notif.title, "body": notif.body, "url": notif.action_url}
                    )
    db.commit()

    # WEBSOCKET BROADCAST - Jetzt inklusive Kategorie
    await manager.broadcast(list_id, {
        "event": "ITEM_UPDATED",
        "payload": {
            "list_id": list_id,
            "item": { "id": new_item.id, "name": new_item.name, "status": new_item.status, "quantity": new_item.quantity, "unit": new_item.unit, "category": new_item.category, "tags": new_item.tags }
        }
    })

    await manager.broadcast(list_id, {
        "event": "CHANGELOG_UPDATED",
        "payload": {}
    })

    return new_item

@app.post("/api/lists/{list_id}/items/bulk", response_model=List[schemas.ItemResponse])
async def create_items_bulk(
    list_id: str,
    bulk_data: schemas.BulkItemCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_list = db.query(models.List).filter(models.List.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")

    if db_list.created_by != current_user.id and current_user not in db_list.members:
        raise HTTPException(status_code=403, detail="Keine Berechtigung für diese Liste")

    created_items = []
    for item_data in bulk_data.items:
        new_item = models.Item(
            list_id=list_id,
            name=item_data.name,
            category=item_data.category or "Sonstiges",
            quantity=item_data.quantity,
            unit=item_data.unit or "Stk",
            note=item_data.note,
            tags=item_data.tags,
            last_modified_by=current_user.id
        )
        db.add(new_item)
        created_items.append(new_item)

    db.commit()
    for it in created_items:
        db.refresh(it)

    try:
        recipe_info = f" aus '{bulk_data.recipe_title}'" if bulk_data.recipe_title else ""
        log_entry = models.ActivityLog(
            list_id=list_id,
            user_id=current_user.id,
            action_type="added",
            item_name=f"{len(created_items)} Artikel{recipe_info}"
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        logger.error(f"Error logging activity for bulk items: {e}")

    # Push Notification gebündelt senden
    try:
        members_list = db_list.members + ([db_list.creator] if db_list.creator else [])
        members = {member.id: member for member in members_list if member}.values()
        for member in members:
            if member and member.id != current_user.id:
                notif = models.Notification(
                    user_id=member.id,
                    title="Neue Artikel hinzugefügt",
                    body=f"{current_user.display_name} hat {len(created_items)} Artikel{recipe_info} zu '{db_list.name}' hinzugefügt.",
                    action_url=f"/list/{db_list.id}"
                )
                db.add(notif)
                if is_user_push_enabled(member, 'settings_push_new_items'):
                    subs = db.query(models.PushSubscription).filter(models.PushSubscription.user_id == member.id).all()
                    for sub in subs:
                        background_tasks.add_task(
                            send_push_notification,
                            {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                            {"title": notif.title, "body": notif.body, "url": notif.action_url}
                        )
        db.commit()
    except Exception as e:
        logger.error(f"Error sending push notifications for bulk items: {e}")

    try:
        # Einzelne WebSocket-Events für Live-Reaktivität
        for it in created_items:
            await manager.broadcast(list_id, {
                "event": "ITEM_UPDATED",
                "payload": {
                    "list_id": list_id,
                    "item": {
                        "id": it.id,
                        "name": it.name,
                        "status": it.status,
                        "quantity": it.quantity,
                        "unit": it.unit,
                        "category": it.category,
                        "tags": it.tags
                    }
                }
            })

        await manager.broadcast(list_id, {
            "event": "CHANGELOG_UPDATED",
            "payload": {}
        })
    except Exception as e:
        logger.error(f"Error broadcasting WebSocket events for bulk items: {e}")

    return created_items

@app.post("/api/recipes/parse", response_model=schemas.RecipeParseResponse)
async def parse_recipe(
    request: schemas.RecipeParseRequest,
    current_user: models.User = Depends(auth.get_current_user)
):
    try:
        result = recipe_service.parse_recipe_url(request.url)
        return result
    except recipe_service.RecipeImportError as e:
        logger.warning(f"Recipe parse error [{e.code}]: {e.user_message}")
        raise HTTPException(
            status_code=e.status_code,
            detail={"code": e.code, "message": e.user_message}
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"code": "invalid_value", "message": str(e)})
    except Exception as e:
        logger.error(f"Fehler beim Verarbeiten des Rezepts: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "code": "timeout_or_network",
                "message": "Die Rezeptseite antwortet gerade nicht oder die Verbindung wurde unterbrochen. Bitte versuche es erneut oder nutze den Text-Import."
            }
        )


@app.post("/api/recipes/parse-text", response_model=schemas.RecipeParseResponse)
async def parse_recipe_text(
    request: schemas.RecipeTextParseRequest,
    current_user: models.User = Depends(auth.get_current_user)
):
    try:
        result = recipe_service.parse_recipe_text(request.text, request.title)
        return result
    except recipe_service.RecipeImportError as e:
        raise HTTPException(
            status_code=e.status_code,
            detail={"code": e.code, "message": e.user_message}
        )
    except Exception as e:
        logger.error(f"Fehler beim Verarbeiten des Text-Rezepts: {e}", exc_info=True)
        raise HTTPException(
            status_code=400,
            detail={"code": "parse_error", "message": "Zutaten konnten nicht verarbeitet werden."}
        )


@app.post("/api/lists/{list_id}/start-shopping")
async def start_shopping(
    list_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_list = db.query(models.List).filter(models.List.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")

    # Berechtigung prüfen: Nur Ersteller oder Mitglieder dürfen Aktion ausführen
    if db_list.created_by != current_user.id and current_user not in db_list.members:
        raise HTTPException(status_code=403, detail="Keine Berechtigung für diese Liste")

    # Mitglieder der Liste vollständig sammeln (inklusive Ersteller)
    members_dict = {m.id: m for m in (db_list.members or []) if m}
    if db_list.created_by and db_list.created_by not in members_dict:
        creator_user = db.query(models.User).filter(models.User.id == db_list.created_by).first()
        if creator_user:
            members_dict[creator_user.id] = creator_user

    user_display = current_user.display_name or "Ein Gruppenmitglied"

    # Push Notification & WebSocket Alert für Einkaufsstart an alle anderen Listenmitglieder
    for member in members_dict.values():
        if member.id != current_user.id:
            notif = models.Notification(
                user_id=member.id,
                title="🛒 Ich gehe einkaufen!",
                body=f"{user_display} ist jetzt für '{db_list.name}' einkaufen. Brauchst du noch etwas?",
                action_url=f"/list/{db_list.id}"
            )
            db.add(notif)
            if is_user_push_enabled(member, 'settings_push_shopping_started'):
                subs = db.query(models.PushSubscription).filter(models.PushSubscription.user_id == member.id).all()
                for sub in subs:
                    background_tasks.add_task(
                        send_push_notification,
                        {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                        {"title": notif.title, "body": notif.body, "url": notif.action_url}
                    )
            # Zusätzlich an den persönlichen WebSocket-Kanal des Mitglieds senden
            await manager.broadcast_user(str(member.id), {
                "event": "NEW_NOTIFICATION",
                "payload": {
                    "id": notif.id,
                    "title": notif.title,
                    "body": notif.body,
                    "url": notif.action_url,
                    "list_id": list_id
                }
            })
    db.commit()

    # Live WebSocket Broadcast an alle aktiven Teilnehmer der Liste
    await manager.broadcast(list_id, {
        "event": "SHOPPING_STARTED",
        "payload": {
            "list_id": list_id,
            "user_id": current_user.id,
            "user_name": user_display,
            "title": "🛒 Ich gehe einkaufen!",
            "body": f"{user_display} ist jetzt für '{db_list.name}' einkaufen. Brauchst du noch etwas?",
            "url": f"/list/{db_list.id}"
        }
    })

    return {"status": "ok"}

@app.post("/api/lists/{list_id}/finish-shopping")
async def finish_shopping(
    list_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_list = db.query(models.List).filter(models.List.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")

    if db_list.created_by != current_user.id and current_user not in db_list.members:
        raise HTTPException(status_code=403, detail="Keine Berechtigung für diese Liste")

    members_dict = {m.id: m for m in (db_list.members or []) if m}
    if db_list.created_by and db_list.created_by not in members_dict:
        creator_user = db.query(models.User).filter(models.User.id == db_list.created_by).first()
        if creator_user:
            members_dict[creator_user.id] = creator_user

    user_display = current_user.display_name or "Ein Gruppenmitglied"

    for member in members_dict.values():
        if member.id != current_user.id and is_user_push_enabled(member, 'settings_push_shopping_done'):
            notif = models.Notification(
                user_id=member.id,
                title="✅ Einkauf abgeschlossen",
                body=f"{user_display} hat den Einkauf für '{db_list.name}' beendet.",
                action_url=f"/list/{db_list.id}"
            )
            db.add(notif)
            subs = db.query(models.PushSubscription).filter(models.PushSubscription.user_id == member.id).all()
            for sub in subs:
                background_tasks.add_task(
                    send_push_notification,
                    {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                    {"title": notif.title, "body": notif.body, "url": notif.action_url}
                )
            await manager.broadcast_user(str(member.id), {
                "event": "NEW_NOTIFICATION",
                "payload": {
                    "id": notif.id,
                    "title": notif.title,
                    "body": notif.body,
                    "url": notif.action_url,
                    "list_id": list_id
                }
            })
    db.commit()

    await manager.broadcast(list_id, {
        "event": "SHOPPING_FINISHED",
        "payload": {
            "list_id": list_id,
            "user_id": current_user.id,
            "user_name": user_display
        }
    })

    return {"status": "ok"}

@app.get("/api/lists/{list_id}/changelog", response_model=List[schemas.ActivityLogResponse])
async def get_list_changelog(
    list_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    # Verify user has access to list
    db_list = db.query(models.List).filter(models.List.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")

    # Check if user is member or creator
    if db_list.created_by != current_user.id and current_user not in db_list.members:
        raise HTTPException(status_code=403, detail="Kein Zugriff auf diese Liste")

    logs = db.query(models.ActivityLog).filter(
        models.ActivityLog.list_id == list_id,
        models.ActivityLog.action_type != "started"
    ).order_by(
        models.ActivityLog.created_at.desc()
    ).limit(50).all()

    # Add user_name
    for log in logs:
        user = db.query(models.User).filter(models.User.id == log.user_id).first() if log.user_id else None
        if user:
            log.user_name = user.display_name
        else:
            log.user_name = "Ehemaliges Mitglied"

    return logs


@app.put("/api/items/{item_id}", response_model=schemas.ItemResponse)
async def update_item(
    item_id: str, 
    item_data: schemas.ItemUpdate, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user) # SCHUTZ
):
    db_item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item nicht gefunden")

    # Berechtigung prüfen: Nur Ersteller oder Mitglieder der Liste dürfen Items ändern
    if db_item.shopping_list.created_by != current_user.id and current_user not in db_item.shopping_list.members:
        raise HTTPException(status_code=403, detail="Keine Berechtigung für dieses Item")
    
    if item_data.name is not None: db_item.name = item_data.name
    if item_data.unit is not None: db_item.unit = item_data.unit
    old_status = db_item.status
    if item_data.status is not None: db_item.status = item_data.status
    if item_data.quantity is not None: db_item.quantity = item_data.quantity
    if item_data.note is not None: db_item.note = item_data.note
    if hasattr(item_data, 'category') and item_data.category is not None: db_item.category = item_data.category
    if hasattr(item_data, 'tags') and item_data.tags is not None: db_item.tags = item_data.tags
    
    db_item.last_modified_by = current_user.id # Letzte Änderung an User binden
        
    db.commit()
    db.refresh(db_item)

    # LOG ACTIVITY (if status changed)
    if item_data.status is not None and old_status != item_data.status:
        action = "completed" if item_data.status == "completed" else "reactivated"
        if item_data.status == "completed":
            record_purchase_event(db, db_item.list_id, db_item.name, db_item.category, db_item.id)
        elif item_data.status == "active" and old_status == "completed":
            retract_purchase_event(db, db_item.list_id, db_item.id)
        log_entry = models.ActivityLog(
            list_id=db_item.list_id,
            user_id=current_user.id,
            action_type=action,
            item_name=db_item.name
        )
        db.add(log_entry)
        db.commit()

        # Push Notification an Mitglieder bei Abhaken
        if item_data.status == "completed":
            db_list = db_item.shopping_list
            members_list = db_list.members + ([db_list.creator] if db_list.creator else [])
            members = {member.id: member for member in members_list if member}.values()
            for member in members:
                if member.id != current_user.id and is_user_push_enabled(member, 'settings_push_completed_items'):
                    notif = models.Notification(
                        user_id=member.id,
                        title="Artikel erledigt",
                        body=f"{current_user.display_name} hat '{db_item.name}' in '{db_list.name}' abgehakt.",
                        action_url=f"/list/{db_list.id}"
                    )
                    db.add(notif)
                    subs = db.query(models.PushSubscription).filter(models.PushSubscription.user_id == member.id).all()
                    for sub in subs:
                        background_tasks.add_task(
                            send_push_notification,
                            {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                            {"title": notif.title, "body": notif.body, "url": notif.action_url}
                        )
            db.commit()

        await manager.broadcast(db_item.list_id, {
            "event": "CHANGELOG_UPDATED",
            "payload": {}
        })

    # WEBSOCKET BROADCAST - Jetzt inklusive Kategorie
    await manager.broadcast(db_item.list_id, {
        "event": "ITEM_UPDATED",
        "payload": {
            "list_id": db_item.list_id,
            "item": { "id": db_item.id, "name": db_item.name, "status": db_item.status, "quantity": db_item.quantity, "unit": db_item.unit, "category": db_item.category, "tags": db_item.tags }
        }
    })
    
    db_item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(db_item)
    
    return db_item
    
@app.delete("/api/items/{item_id}")
async def delete_item(
    item_id: str, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user) # SCHUTZ
):
    db_item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item nicht gefunden")

    # Berechtigung prüfen: Nur Ersteller oder Mitglieder der Liste dürfen Items ändern
    if db_item.shopping_list.created_by != current_user.id and current_user not in db_item.shopping_list.members:
        raise HTTPException(status_code=403, detail="Keine Berechtigung für dieses Item")
    
    list_id = db_item.list_id
    item_name = db_item.name
    db_item.is_deleted = True
    db_item.updated_at = datetime.now(timezone.utc)
    db.commit()

    # LOG ACTIVITY
    log_entry = models.ActivityLog(
        list_id=list_id,
        user_id=current_user.id,
        action_type="deleted",
        item_name=item_name
    )
    db.add(log_entry)
    db.commit()

    # WEBSOCKET BROADCAST
    await manager.broadcast(list_id, {
        "event": "ITEM_DELETED",
        "payload": {
            "list_id": list_id,
            "item_id": item_id
        }
    })
    
    await manager.broadcast(list_id, {
        "event": "CHANGELOG_UPDATED",
        "payload": {}
    })

    return {"status": "ok", "message": "Item gelöscht"}

@app.post("/api/lists/{list_id}/sync", response_model=schemas.ListSyncResponse)
async def sync_list(
    list_id: str,
    sync_data: schemas.ListSyncRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_list = db.query(models.List).filter(models.List.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")

    if db_list.created_by != current_user.id and current_user not in db_list.members:
        raise HTTPException(status_code=403, detail="Keine Berechtigung für diese Liste")

    processed = 0
    now = datetime.now(timezone.utc)
    activity_logs_to_add = []
    new_item_names = []
    completed_item_names = []

    for mut in sync_data.mutations:
        action = mut.action
        item_id = mut.item_id
        payload = mut.payload or {}

        if action == "ADD_ITEM":
            name = payload.get("name")
            if name:
                target_id = item_id or payload.get("id")
                existing = db.query(models.Item).filter(models.Item.id == target_id).first() if target_id else None
                if existing:
                    was_deleted = existing.is_deleted
                    existing.is_deleted = False
                    existing.name = name
                    existing.category = payload.get("category", existing.category or "Sonstiges")
                    existing.quantity = payload.get("quantity", existing.quantity or 1)
                    existing.unit = payload.get("unit", existing.unit or "Stk")
                    existing.note = payload.get("note", existing.note)
                    existing.status = payload.get("status", "active")
                    existing.updated_at = now
                    existing.last_modified_by = current_user.id
                    log_action = "reactivated" if was_deleted else "added"
                    activity_logs_to_add.append(models.ActivityLog(
                        list_id=list_id,
                        user_id=current_user.id,
                        action_type=log_action,
                        item_name=name
                    ))
                    if log_action == "added":
                        new_item_names.append(name)
                else:
                    new_item = models.Item(
                        id=target_id or models.generate_uuid(),
                        list_id=list_id,
                        name=name,
                        category=payload.get("category", "Sonstiges"),
                        quantity=payload.get("quantity", 1),
                        unit=payload.get("unit", "Stk"),
                        note=payload.get("note"),
                        tags=payload.get("tags"),
                        status=payload.get("status", "active"),
                        last_modified_by=current_user.id,
                        updated_at=now,
                        is_deleted=False
                    )
                    db.add(new_item)
                    activity_logs_to_add.append(models.ActivityLog(
                        list_id=list_id,
                        user_id=current_user.id,
                        action_type="added",
                        item_name=name
                    ))
                    new_item_names.append(name)
                processed += 1

        elif action == "UPDATE_ITEM":
            if item_id:
                item = db.query(models.Item).filter(models.Item.id == item_id, models.Item.list_id == list_id).first()
                if item:
                    old_status = item.status
                    for field in ["name", "category", "quantity", "unit", "note", "status", "tags"]:
                        if field in payload and payload[field] is not None:
                            setattr(item, field, payload[field])
                    item.updated_at = now
                    item.last_modified_by = current_user.id
                    if "status" in payload and payload["status"] != old_status:
                        log_action = "completed" if payload["status"] == "completed" else "reactivated"
                        if log_action == "completed":
                            record_purchase_event(db, list_id, item.name, item.category, item.id)
                        elif log_action == "reactivated":
                            retract_purchase_event(db, list_id, item.id)
                        activity_logs_to_add.append(models.ActivityLog(
                            list_id=list_id,
                            user_id=current_user.id,
                            action_type=log_action,
                            item_name=item.name
                        ))
                        if log_action == "completed":
                            completed_item_names.append(item.name)
                    processed += 1

        elif action == "TOGGLE_STATUS":
            if item_id:
                item = db.query(models.Item).filter(models.Item.id == item_id, models.Item.list_id == list_id).first()
                if item:
                    old_status = item.status
                    new_status = payload.get("status", "completed" if old_status == "active" else "active")
                    item.status = new_status
                    item.updated_at = now
                    item.last_modified_by = current_user.id
                    log_action = "completed" if new_status == "completed" else "reactivated"
                    if log_action == "completed":
                        record_purchase_event(db, list_id, item.name, item.category, item.id)
                    elif log_action == "reactivated":
                        retract_purchase_event(db, list_id, item.id)
                    activity_logs_to_add.append(models.ActivityLog(
                        list_id=list_id,
                        user_id=current_user.id,
                        action_type=log_action,
                        item_name=item.name
                    ))
                    if log_action == "completed":
                        completed_item_names.append(item.name)
                    processed += 1

        elif action == "DELETE_ITEM":
            if item_id:
                item = db.query(models.Item).filter(models.Item.id == item_id, models.Item.list_id == list_id).first()
                if item:
                    item.is_deleted = True
                    item.updated_at = now
                    activity_logs_to_add.append(models.ActivityLog(
                        list_id=list_id,
                        user_id=current_user.id,
                        action_type="deleted",
                        item_name=item.name
                    ))
                    processed += 1

        elif action == "CLEAR_COMPLETED":
            completed_items = db.query(models.Item).filter(
                models.Item.list_id == list_id,
                models.Item.status == "completed",
                models.Item.is_deleted == False
            ).all()
            for it in completed_items:
                it.is_deleted = True
                it.updated_at = now
                activity_logs_to_add.append(models.ActivityLog(
                    list_id=list_id,
                    user_id=current_user.id,
                    action_type="deleted",
                    item_name=it.name
                ))
                processed += 1

    # Alle erfassten Aktivitäten in die Datenbank schreiben
    for log_entry in activity_logs_to_add:
        db.add(log_entry)

    db.commit()

    if processed > 0:
        await manager.broadcast(list_id, {
            "event": "LIST_SYNCED",
            "payload": { "list_id": list_id }
        })
        if activity_logs_to_add:
            await manager.broadcast(list_id, {
                "event": "CHANGELOG_UPDATED",
                "payload": {}
            })

    # Listenmitglieder für Benachrichtigungen ermitteln
    members_dict = {m.id: m for m in (db_list.members or []) if m}
    if db_list.created_by and db_list.created_by not in members_dict:
        creator_user = db.query(models.User).filter(models.User.id == db_list.created_by).first()
        if creator_user:
            members_dict[creator_user.id] = creator_user

    user_display = current_user.display_name or "Ein Gruppenmitglied"

    # Push & WebSocket Notifications für neue Artikel
    if new_item_names:
        title = "Neuer Artikel" if len(new_item_names) == 1 else "Neue Artikel hinzugefügt"
        body = f"{user_display} hat {new_item_names[0]} zu '{db_list.name}' hinzugefügt." if len(new_item_names) == 1 else f"{user_display} hat {len(new_item_names)} Artikel zu '{db_list.name}' hinzugefügt."
        for member in members_dict.values():
            if member.id != current_user.id and is_user_push_enabled(member, 'settings_push_new_items'):
                notif = models.Notification(
                    user_id=member.id,
                    title=title,
                    body=body,
                    action_url=f"/list/{db_list.id}"
                )
                db.add(notif)
                subs = db.query(models.PushSubscription).filter(models.PushSubscription.user_id == member.id).all()
                for sub in subs:
                    background_tasks.add_task(
                        send_push_notification,
                        {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                        {"title": notif.title, "body": notif.body, "url": notif.action_url}
                    )
                await manager.broadcast_user(str(member.id), {
                    "event": "NEW_NOTIFICATION",
                    "payload": {
                        "id": notif.id,
                        "title": notif.title,
                        "body": notif.body,
                        "url": notif.action_url,
                        "list_id": db_list.id
                    }
                })
        db.commit()

    # Push & WebSocket Notifications für abgehakte Artikel
    if completed_item_names:
        title = "Artikel erledigt"
        body = f"{user_display} hat '{completed_item_names[0]}' in '{db_list.name}' abgehakt." if len(completed_item_names) == 1 else f"{user_display} hat {len(completed_item_names)} Artikel in '{db_list.name}' abgehakt."
        for member in members_dict.values():
            if member.id != current_user.id and is_user_push_enabled(member, 'settings_push_completed_items'):
                notif = models.Notification(
                    user_id=member.id,
                    title=title,
                    body=body,
                    action_url=f"/list/{db_list.id}"
                )
                db.add(notif)
                subs = db.query(models.PushSubscription).filter(models.PushSubscription.user_id == member.id).all()
                for sub in subs:
                    background_tasks.add_task(
                        send_push_notification,
                        {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                        {"title": notif.title, "body": notif.body, "url": notif.action_url}
                    )
                await manager.broadcast_user(str(member.id), {
                    "event": "NEW_NOTIFICATION",
                    "payload": {
                        "id": notif.id,
                        "title": notif.title,
                        "body": notif.body,
                        "url": notif.action_url,
                        "list_id": db_list.id
                    }
                })
        db.commit()

    active_items = db.query(models.Item).filter(
        models.Item.list_id == list_id,
        models.Item.is_deleted == False
    ).all()

    deleted_ids = []
    if sync_data.last_synced_at:
        try:
            since = datetime.fromisoformat(sync_data.last_synced_at.replace("Z", "+00:00"))
            del_items = db.query(models.Item.id).filter(
                models.Item.list_id == list_id,
                models.Item.is_deleted == True,
                models.Item.updated_at >= since
            ).all()
            deleted_ids = [row[0] for row in del_items]
        except Exception:
            pass

    return {
        "server_time": now.isoformat(),
        "processed_count": processed,
        "items": active_items,
        "deleted_item_ids": deleted_ids
    }

import pathlib

# --- STATIC FILES & SPA FALLBACK ---
@app.get("/{full_path:path}")
async def serve_static(full_path: str):
    """
    Catch-all Route für das Ausliefern der Vue.js SPA und statischer Dateien.
    Alle Anfragen, die nicht von der API (/api/...) oder WebSockets (/ws/...)
    gefangen werden, landen hier.
    """
    # Verhindere, dass API oder WS Routen als statische Dateien oder index.html beantwortet werden
    if full_path.startswith("api/") or full_path.startswith("ws/"):
        raise HTTPException(status_code=404, detail="Not found")

    static_dir = pathlib.Path("static").resolve()
    # Sichere Pfad-Auflösung gegen Path-Traversal
    # .resolve() entfernt /../ und macht den Pfad absolut.
    file_path = (static_dir / full_path).resolve()

    # Sicherstellen, dass die Datei auch WIRKLICH im static_dir liegt
    try:
        file_path.relative_to(static_dir)
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found")

    # Prüfen, ob die Datei existiert (z.B. /assets/main.js) und kein Verzeichnis ist
    if full_path and file_path.is_file():
        return FileResponse(file_path)

    # Ansonsten immer die index.html ausliefern (Vue Router History-Modus Fallback)
    index_path = static_dir / "index.html"
    if index_path.is_file():
        return FileResponse(index_path)

    raise HTTPException(status_code=404, detail="Static files not found")