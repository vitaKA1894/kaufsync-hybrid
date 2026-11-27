"""
Outlier-protected crowd pricing aggregation and open community barcode lookup.
"""
import json
import os
import statistics
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional
import urllib.request
from sqlalchemy.orm import Session

import models

MIN_CROWD_QUORUM = 3
WINDOW_DAYS = 120
MIN_PLAUSIBLE_EUR = 0.05
MAX_PLAUSIBLE_EUR = 500.0
EXTERNAL_CACHE_TTL_SEC = 6 * 3600

_TAXONOMY_PRICE_INDEX: Optional[Dict[str, float]] = None
_EXTERNAL_BARCODE_CACHE: Dict[str, tuple[float, Optional[float]]] = {}


def _load_taxonomy_price_index() -> Dict[str, float]:
    global _TAXONOMY_PRICE_INDEX
    if _TAXONOMY_PRICE_INDEX is not None:
        return _TAXONOMY_PRICE_INDEX

    idx: Dict[str, float] = {}
    tax_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "taxonomy.json")
    try:
        with open(tax_path, "r", encoding="utf-8") as f:
            items = json.load(f)
        for it in items:
            ref = it.get("reference_price_eur")
            if isinstance(ref, (int, float)) and ref > 0:
                if it.get("id"):
                    idx[str(it["id"]).lower()] = float(ref)
                if it.get("name"):
                    idx[str(it["name"]).strip().lower()] = float(ref)
                for alias in it.get("aliases") or []:
                    a_key = str(alias).strip().lower()
                    if a_key and a_key not in idx:
                        idx[a_key] = float(ref)
    except Exception:
        idx = {}
    _TAXONOMY_PRICE_INDEX = idx
    return idx


def get_taxonomy_reference_price(price_key: str) -> Optional[float]:
    if not price_key:
        return None
    idx = _load_taxonomy_price_index()
    return idx.get(str(price_key).strip().lower())


def is_plausible_crowd_price(unit_price: float, ref_price: Optional[float] = None) -> bool:
    if unit_price is None or unit_price < MIN_PLAUSIBLE_EUR or unit_price > MAX_PLAUSIBLE_EUR:
        return False
    if ref_price is not None and ref_price > 0:
        if unit_price < (0.25 * ref_price) or unit_price > (4.0 * ref_price):
            return False
    return True


def _normalize_dt_naive(dt: datetime) -> datetime:
    if dt is None:
        return datetime.min
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def recompute_crowd_aggregate(
    db: Session,
    price_key_type: str,
    price_key: str,
    now: Optional[datetime] = None,
) -> Optional[models.CrowdPriceAggregate]:
    """
    Recomputes the anonymized median crowd price for (price_key_type, price_key)
    using only non-bulk prices updated within the last 120 days, within plausibility
    bounds, and only publishes once >= 3 distinct users have contributed.
    """
    now = now or datetime.now(timezone.utc)
    cutoff_naive = _normalize_dt_naive(now) - timedelta(days=WINDOW_DAYS)

    ref_price = get_taxonomy_reference_price(price_key) if price_key_type == "article" else None

    rows = db.query(models.UserItemPrice).filter(
        models.UserItemPrice.price_key_type == price_key_type,
        models.UserItemPrice.price_key == price_key,
        models.UserItemPrice.is_bulk_variant == False,
    ).all()

    per_user_latest: Dict[str, float] = {}
    for row in rows:
        row_dt = _normalize_dt_naive(row.updated_at or row.created_at)
        if row_dt < cutoff_naive:
            continue
        val = float(row.unit_price_eur or 0.0)
        if not is_plausible_crowd_price(val, ref_price):
            continue
        per_user_latest[row.user_id] = val

    distinct_users = len(per_user_latest)
    existing = db.query(models.CrowdPriceAggregate).filter(
        models.CrowdPriceAggregate.price_key_type == price_key_type,
        models.CrowdPriceAggregate.price_key == price_key,
    ).first()

    if distinct_users < MIN_CROWD_QUORUM:
        # Remove inactive crowd aggregate (keep external_open_prices if that was set)
        if existing and existing.source == "crowd":
            db.delete(existing)
            db.flush()
            return None
        return existing

    median_val = round(float(statistics.median(per_user_latest.values())), 2)
    if existing:
        existing.median_price_eur = median_val
        existing.contributor_count = distinct_users
        existing.source = "crowd"
        existing.computed_at = now
        db.flush()
        return existing

    agg = models.CrowdPriceAggregate(
        id=models.generate_uuid(),
        price_key_type=price_key_type,
        price_key=price_key,
        median_price_eur=median_val,
        contributor_count=distinct_users,
        source="crowd",
        computed_at=now,
    )
    db.add(agg)
    db.flush()
    return agg


def lookup_external_open_price(barcode: str, timeout_sec: float = 2.5) -> Optional[float]:
    """
    Best-effort lookup against Open Food Facts Open Prices API for Germany/EUR.
    Fails silently on timeouts, rate limits, or network errors.
    """
    clean = "".join(ch for ch in (barcode or "") if ch.isdigit())
    if len(clean) < 8:
        return None

    now_ts = time.time()
    cached = _EXTERNAL_BARCODE_CACHE.get(clean)
    if cached and (now_ts - cached[0]) < EXTERNAL_CACHE_TTL_SEC:
        return cached[1]

    url = (
        f"https://prices.openfoodfacts.org/api/v1/prices"
        f"?product_code={clean}&currency=EUR&size=12"
    )
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "KaufSync/1.2 (PriceLookup; contact@kaufsync.de)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            if resp.status != 200:
                _EXTERNAL_BARCODE_CACHE[clean] = (now_ts, None)
                return None
            payload = json.loads(resp.read().decode("utf-8"))
        items = payload.get("items") or []
        prices = []
        for entry in items:
            if (entry.get("currency") or "").upper() != "EUR":
                continue
            p = entry.get("price")
            if isinstance(p, (int, float)) and MIN_PLAUSIBLE_EUR <= float(p) <= MAX_PLAUSIBLE_EUR:
                prices.append(float(p))
        result = round(float(statistics.median(prices)), 2) if prices else None
        _EXTERNAL_BARCODE_CACHE[clean] = (now_ts, result)
        return result
    except Exception:
        _EXTERNAL_BARCODE_CACHE[clean] = (now_ts, None)
        return None
