package com.kaufsync.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

public final class WidgetDataStore {
    private static final String PREFS_NAME = "KaufSyncWidgetPrefs";
    private static final String KEY_SNAPSHOT = "snapshot_json";
    private static final String KEY_PENDING_CHECKOFFS = "pending_checkoffs_json";
    private static final String KEY_WIDGET_LIST_PREFIX = "widget_list_";
    private static final Object LOCK = new Object();

    private WidgetDataStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static void saveSnapshotJson(Context context, String snapshotJson) {
        synchronized (LOCK) {
            prefs(context).edit().putString(KEY_SNAPSHOT, snapshotJson != null ? snapshotJson : "{}").apply();
        }
    }

    public static JSONObject getSnapshot(Context context) {
        synchronized (LOCK) {
            String raw = prefs(context).getString(KEY_SNAPSHOT, null);
            if (raw == null || raw.isEmpty()) {
                return new JSONObject();
            }
            try {
                return new JSONObject(raw);
            } catch (Exception e) {
                return new JSONObject();
            }
        }
    }

    public static void clearAll(Context context) {
        synchronized (LOCK) {
            prefs(context).edit().clear().apply();
        }
    }

    public static String getWidgetSelectedListId(Context context, int appWidgetId) {
        synchronized (LOCK) {
            return prefs(context).getString(KEY_WIDGET_LIST_PREFIX + appWidgetId, null);
        }
    }

    public static void setWidgetSelectedListId(Context context, int appWidgetId, String listId) {
        synchronized (LOCK) {
            prefs(context).edit().putString(KEY_WIDGET_LIST_PREFIX + appWidgetId, listId).apply();
        }
    }

    public static void removeWidgetSelectedListId(Context context, int appWidgetId) {
        synchronized (LOCK) {
            prefs(context).edit().remove(KEY_WIDGET_LIST_PREFIX + appWidgetId).apply();
        }
    }

    public static String resolveEffectiveListId(Context context, JSONObject snapshot, int appWidgetId) {
        JSONArray lists = snapshot.optJSONArray("lists_summary");
        if (lists == null || lists.length() == 0) {
            return null;
        }
        String widgetListId = getWidgetSelectedListId(context, appWidgetId);
        if (containsList(lists, widgetListId)) {
            return widgetListId;
        }
        String snapshotSelected = snapshot.optString("selected_list_id", null);
        if (containsList(lists, snapshotSelected)) {
            return snapshotSelected;
        }
        try {
            return lists.getJSONObject(0).optString("id", null);
        } catch (Exception e) {
            return null;
        }
    }

    private static boolean containsList(JSONArray lists, String targetId) {
        if (targetId == null || targetId.isEmpty() || lists == null) return false;
        for (int i = 0; i < lists.length(); i++) {
            JSONObject obj = lists.optJSONObject(i);
            if (obj != null && targetId.equals(obj.optString("id"))) {
                return true;
            }
        }
        return false;
    }

    public static String getPendingCheckoffsJson(Context context) {
        synchronized (LOCK) {
            return prefs(context).getString(KEY_PENDING_CHECKOFFS, "[]");
        }
    }

    public static void ackPendingCheckoffs(Context context, JSONArray opIds) {
        if (opIds == null || opIds.length() == 0) return;
        Set<String> ackSet = new HashSet<>();
        for (int i = 0; i < opIds.length(); i++) {
            String id = opIds.optString(i, null);
            if (id != null) ackSet.add(id);
        }
        synchronized (LOCK) {
            try {
                JSONArray current = new JSONArray(prefs(context).getString(KEY_PENDING_CHECKOFFS, "[]"));
                JSONArray next = new JSONArray();
                for (int i = 0; i < current.length(); i++) {
                    JSONObject op = current.optJSONObject(i);
                    if (op != null && !ackSet.contains(op.optString("op_id"))) {
                        next.put(op);
                    }
                }
                prefs(context).edit().putString(KEY_PENDING_CHECKOFFS, next.toString()).apply();
            } catch (Exception ignored) {}
        }
    }

    public static final class OptimisticCheckoffResult {
        public final String opId;
        public final String authToken;
        public final String apiBaseUrl;

        public OptimisticCheckoffResult(String opId, String authToken, String apiBaseUrl) {
            this.opId = opId;
            this.authToken = authToken;
            this.apiBaseUrl = apiBaseUrl;
        }
    }

    /**
     * Atomically removes the checked-off item from the local widget snapshot,
     * updates open_count, and queues an idempotent pending check-off entry.
     */
    public static OptimisticCheckoffResult recordOptimisticCheckoff(Context context, String listId, String itemId) {
        if (listId == null || itemId == null) return null;
        synchronized (LOCK) {
            JSONObject snapshot = getSnapshot(context);
            if (!snapshot.optBoolean("is_authenticated", false)) {
                return null;
            }
            String authToken = snapshot.optString("auth_token", "");
            String apiBaseUrl = snapshot.optString("api_base_url", "");

            try {
                JSONObject itemsByList = snapshot.optJSONObject("items_by_list");
                if (itemsByList != null) {
                    JSONArray listItems = itemsByList.optJSONArray(listId);
                    if (listItems != null) {
                        JSONArray filtered = new JSONArray();
                        for (int i = 0; i < listItems.length(); i++) {
                            JSONObject row = listItems.optJSONObject(i);
                            if (row != null && !itemId.equals(row.optString("id"))) {
                                filtered.put(row);
                            }
                        }
                        itemsByList.put(listId, filtered);

                        JSONArray summary = snapshot.optJSONArray("lists_summary");
                        if (summary != null) {
                            for (int i = 0; i < summary.length(); i++) {
                                JSONObject l = summary.optJSONObject(i);
                                if (l != null && listId.equals(l.optString("id"))) {
                                    l.put("open_count", filtered.length());
                                }
                            }
                        }
                    }
                }
                prefs(context).edit().putString(KEY_SNAPSHOT, snapshot.toString()).apply();

                String opId = UUID.randomUUID().toString();
                SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
                iso.setTimeZone(TimeZone.getTimeZone("UTC"));
                String nowIso = iso.format(new Date());

                JSONArray pending = new JSONArray(prefs(context).getString(KEY_PENDING_CHECKOFFS, "[]"));
                JSONObject op = new JSONObject();
                op.put("op_id", opId);
                op.put("list_id", listId);
                op.put("item_id", itemId);
                op.put("checked_at", nowIso);
                pending.put(op);
                prefs(context).edit().putString(KEY_PENDING_CHECKOFFS, pending.toString()).apply();

                return new OptimisticCheckoffResult(opId, authToken, apiBaseUrl);
            } catch (Exception e) {
                return null;
            }
        }
    }

    public static boolean isNetworkOnline(Context context) {
        try {
            ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            Network network = cm.getActiveNetwork();
            if (network == null) return false;
            NetworkCapabilities caps = cm.getNetworkCapabilities(network);
            return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception e) {
            return false;
        }
    }
}
