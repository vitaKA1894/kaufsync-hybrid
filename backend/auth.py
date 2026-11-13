from datetime import datetime, timezone, timedelta
from typing import Optional
import jwt
from jwt.exceptions import PyJWTError, ExpiredSignatureError
import bcrypt
import logging
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db
import models
import os

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "fallback_only_for_local_dev")
if SECRET_KEY == "fallback_only_for_local_dev":
    logging.getLogger("uvicorn.error").warning(
        "SICHERHEITSHINWEIS: Standard-JWT_SECRET_KEY aktiv! Setze in Produktion unbedingt die Umgebungsvariable JWT_SECRET_KEY."
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8")
    )

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"), 
        bcrypt.gensalt()
    ).decode("utf-8")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    now_utc = datetime.now(timezone.utc)
    if expires_delta:
        expire = now_utc + expires_delta
    else:
        expire = now_utc + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_user_from_token(token: str, db: Session) -> Optional[models.User]:
    """Hilfsfunktion zum Validieren von JWT-Tokens (REST & WebSockets)."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            return None
        user = db.query(models.User).filter(models.User.id == user_id).first()
        return user
    except (PyJWTError, Exception):
        return None

def get_current_user(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get("access_token")
    
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
        else:
            raise HTTPException(status_code=401, detail="Nicht authentifiziert")

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Ungültige Authentifizierungsdaten",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token abgelaufen")
    except PyJWTError:
        raise credentials_exception
        
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None:
        raise credentials_exception

    # Sicherheitsprüfung: Status des Benutzers
    if user.status != "active":
        if user.status == "pending":
            raise HTTPException(status_code=403, detail="Dein Benutzerkonto wartet noch auf Freischaltung durch einen Administrator.")
        elif user.status == "locked":
            raise HTTPException(status_code=403, detail="Dein Benutzerkonto wurde gesperrt.")
        else:
            raise HTTPException(status_code=403, detail="Zugriff verweigert (Konto nicht aktiv).")

    return user
