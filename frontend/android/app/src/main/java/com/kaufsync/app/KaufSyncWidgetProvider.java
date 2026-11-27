package com.kaufsync.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

public class KaufSyncWidgetProvider extends AppWidgetProvider {
    public static final String ACTION_WIDGET_CHECKOFF = "com.kaufsync.app.ACTION_WIDGET_CHECKOFF";
    public static final String ACTION_SWITCH_LIST = "com.kaufsync.app.ACTION_SWITCH_LIST";
    public static final String EXTRA_LIST_ID = "extra_list_id";
    public static final String EXTRA_ITEM_ID = "extra_item_id";

    private static final ExecutorService NETWORK_EXECUTOR = Executors.newSingleThreadExecutor();

    public static void refreshAllWidgets(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        ComponentName cn = new ComponentName(context, KaufSyncWidgetProvider.class);
        int[] ids = mgr.getAppWidgetIds(cn);
        if (ids != null && ids.length > 0) {
            mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_items_list);
            for (int id : ids) {
                updateSingleWidget(context, mgr, id);
            }
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateSingleWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            WidgetDataStore.removeWidgetSelectedListId(context, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent == null || intent.getAction() == null) return;

        String action = intent.getAction();
        if (ACTION_WIDGET_CHECKOFF.equals(action)) {
            final String listId = intent.getStringExtra(EXTRA_LIST_ID);
            final String itemId = intent.getStringExtra(EXTRA_ITEM_ID);
            if (listId == null || itemId == null) return;

            final WidgetDataStore.OptimisticCheckoffResult opRes =
                WidgetDataStore.recordOptimisticCheckoff(context, listId, itemId);
            refreshAllWidgets(context);

            if (opRes != null && opRes.authToken != null && !opRes.authToken.isEmpty()
                && opRes.apiBaseUrl != null && !opRes.apiBaseUrl.isEmpty()
                && WidgetDataStore.isNetworkOnline(context)) {
                final PendingResult pendingResult = goAsync();
                final Context appCtx = context.getApplicationContext();
                NETWORK_EXECUTOR.execute(() -> {
                    try {
                        boolean ok = postWidgetCheckoffSync(
                            opRes.apiBaseUrl,
                            opRes.authToken,
                            listId,
                            itemId,
                            opRes.opId
                        );
                        if (ok) {
                            JSONArray acked = new JSONArray();
                            acked.put(opRes.opId);
                            WidgetDataStore.ackPendingCheckoffs(appCtx, acked);
                        }
                    } finally {
                        if (pendingResult != null) {
                            try { pendingResult.finish(); } catch (Exception ignored) {}
                        }
                    }
                });
            }
        } else if (ACTION_SWITCH_LIST.equals(action)) {
            int appWidgetId = intent.getIntExtra(
                AppWidgetManager.EXTRA_APPWIDGET_ID,
                AppWidgetManager.INVALID_APPWIDGET_ID
            );
            if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                cycleWidgetList(context, appWidgetId);
            }
        }
    }

    private static void cycleWidgetList(Context context, int appWidgetId) {
        JSONObject snapshot = WidgetDataStore.getSnapshot(context);
        JSONArray lists = snapshot.optJSONArray("lists_summary");
        if (lists == null || lists.length() <= 1) {
            return;
        }
        String currentId = WidgetDataStore.resolveEffectiveListId(context, snapshot, appWidgetId);
        int currentIdx = 0;
        for (int i = 0; i < lists.length(); i++) {
            JSONObject obj = lists.optJSONObject(i);
            if (obj != null && obj.optString("id").equals(currentId)) {
                currentIdx = i;
                break;
            }
        }
        int nextIdx = (currentIdx + 1) % lists.length();
        JSONObject nextList = lists.optJSONObject(nextIdx);
        if (nextList != null) {
            WidgetDataStore.setWidgetSelectedListId(context, appWidgetId, nextList.optString("id"));
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            mgr.notifyAppWidgetViewDataChanged(appWidgetId, R.id.widget_items_list);
            updateSingleWidget(context, mgr, appWidgetId);
        }
    }

    private static boolean postWidgetCheckoffSync(
        String baseUrl,
        String authToken,
        String listId,
        String itemId,
        String opId
    ) {
        HttpURLConnection conn = null;
        try {
            String endpoint = baseUrl.replaceAll("/+$", "") + "/api/lists/" + listId + "/sync";
            URL url = new URL(endpoint);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(8000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setRequestProperty("Authorization", "Bearer " + authToken);

            JSONObject mut = new JSONObject();
            mut.put("id", opId);
            mut.put("action", "TOGGLE_STATUS");
            mut.put("item_id", itemId);
            JSONObject payload = new JSONObject();
            payload.put("status", "completed");
            mut.put("payload", payload);

            JSONArray muts = new JSONArray();
            muts.put(mut);
            JSONObject body = new JSONObject();
            body.put("mutations", muts);

            byte[] out = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(out);
            }
            int code = conn.getResponseCode();
            return code >= 200 && code < 300;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) {
                try { conn.disconnect(); } catch (Exception ignored) {}
            }
        }
    }

    private static void updateSingleWidget(Context context, AppWidgetManager mgr, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_kaufsync);
        JSONObject snapshot = WidgetDataStore.getSnapshot(context);
        boolean isAuth = snapshot.optBoolean("is_authenticated", false);
        boolean offline = !WidgetDataStore.isNetworkOnline(context);
        views.setViewVisibility(R.id.widget_offline_badge, (isAuth && offline) ? View.VISIBLE : View.GONE);

        int immutableFlags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;

        // Default launcher intent
        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openAppPi = PendingIntent.getActivity(context, appWidgetId * 10 + 1, launchIntent, immutableFlags);

        if (!isAuth) {
            views.setTextViewText(R.id.widget_list_title, "KaufSync");
            views.setTextViewText(R.id.widget_open_count, "–");
            views.setViewVisibility(R.id.widget_switch_chevron, View.GONE);
            views.setViewVisibility(R.id.widget_items_list, View.GONE);
            views.setViewVisibility(R.id.widget_empty_view, View.GONE);
            views.setViewVisibility(R.id.widget_message_container, View.VISIBLE);
            views.setTextViewText(R.id.widget_message_title, "Bitte in KaufSync anmelden");
            views.setTextViewText(R.id.widget_message_sub, "Tippen zum Anmelden");
            views.setOnClickPendingIntent(R.id.widget_message_container, openAppPi);
            views.setOnClickPendingIntent(R.id.widget_open_app_icon, openAppPi);
            views.setOnClickPendingIntent(R.id.widget_btn_add, openAppPi);
            views.setOnClickPendingIntent(R.id.widget_btn_scan, openAppPi);
            mgr.updateAppWidget(appWidgetId, views);
            return;
        }

        JSONArray lists = snapshot.optJSONArray("lists_summary");
        if (lists == null || lists.length() == 0) {
            views.setTextViewText(R.id.widget_list_title, "KaufSync");
            views.setTextViewText(R.id.widget_open_count, "0");
            views.setViewVisibility(R.id.widget_switch_chevron, View.GONE);
            views.setViewVisibility(R.id.widget_items_list, View.GONE);
            views.setViewVisibility(R.id.widget_empty_view, View.GONE);
            views.setViewVisibility(R.id.widget_message_container, View.VISIBLE);
            views.setTextViewText(R.id.widget_message_title, "Erste Liste in KaufSync erstellen");
            views.setTextViewText(R.id.widget_message_sub, "Tippen zum Starten");
            views.setOnClickPendingIntent(R.id.widget_message_container, openAppPi);
            views.setOnClickPendingIntent(R.id.widget_open_app_icon, openAppPi);
            mgr.updateAppWidget(appWidgetId, views);
            return;
        }

        String listId = WidgetDataStore.resolveEffectiveListId(context, snapshot, appWidgetId);
        String listName = "KaufSync";
        int openCount = 0;
        for (int i = 0; i < lists.length(); i++) {
            JSONObject obj = lists.optJSONObject(i);
            if (obj != null && obj.optString("id").equals(listId)) {
                listName = obj.optString("name", "Liste");
                openCount = obj.optInt("open_count", 0);
                break;
            }
        }

        views.setTextViewText(R.id.widget_list_title, listName);
        views.setTextViewText(R.id.widget_open_count, String.valueOf(openCount));
        views.setViewVisibility(R.id.widget_switch_chevron, lists.length() > 1 ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_message_container, View.GONE);
        views.setViewVisibility(R.id.widget_items_list, View.VISIBLE);
        views.setEmptyView(R.id.widget_items_list, R.id.widget_empty_view);

        // Open current list intent
        Intent openListIntent = new Intent(context, MainActivity.class);
        openListIntent.setAction(Intent.ACTION_VIEW);
        openListIntent.setData(Uri.parse("kaufsync://list/" + Uri.encode(listId)));
        openListIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openListPi = PendingIntent.getActivity(context, appWidgetId * 10 + 2, openListIntent, immutableFlags);
        views.setOnClickPendingIntent(R.id.widget_open_app_icon, openListPi);
        views.setOnClickPendingIntent(R.id.widget_empty_view, openListPi);

        // Switch list broadcast button (cycles cleanly across user's lists)
        Intent switchIntent = new Intent(context, KaufSyncWidgetProvider.class);
        switchIntent.setAction(ACTION_SWITCH_LIST);
        switchIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        PendingIntent switchPi = PendingIntent.getBroadcast(context, appWidgetId * 10 + 3, switchIntent, immutableFlags);
        views.setOnClickPendingIntent(R.id.widget_switch_list_btn, lists.length() > 1 ? switchPi : openListPi);

        // Direct + button
        Intent addIntent = new Intent(context, MainActivity.class);
        addIntent.setAction(Intent.ACTION_VIEW);
        addIntent.setData(Uri.parse("kaufsync://shortcut?action=add&list_id=" + Uri.encode(listId)));
        addIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent addPi = PendingIntent.getActivity(context, appWidgetId * 10 + 4, addIntent, immutableFlags);
        views.setOnClickPendingIntent(R.id.widget_btn_add, addPi);

        // Direct Barcode Scan button
        Intent scanIntent = new Intent(context, MainActivity.class);
        scanIntent.setAction(Intent.ACTION_VIEW);
        scanIntent.setData(Uri.parse("kaufsync://shortcut?action=scan&list_id=" + Uri.encode(listId)));
        scanIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent scanPi = PendingIntent.getActivity(context, appWidgetId * 10 + 5, scanIntent, immutableFlags);
        views.setOnClickPendingIntent(R.id.widget_btn_scan, scanPi);

        // RemoteViewsService Adapter for scrolling list items
        Intent svcIntent = new Intent(context, KaufSyncWidgetService.class);
        svcIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        svcIntent.setData(Uri.parse(svcIntent.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_items_list, svcIntent);

        // Fill-in template for interactive item check-off (requires FLAG_MUTABLE + explicit component)
        Intent checkoffTemplate = new Intent(context, KaufSyncWidgetProvider.class);
        checkoffTemplate.setAction(ACTION_WIDGET_CHECKOFF);
        int mutableFlags = PendingIntent.FLAG_UPDATE_CURRENT |
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
        PendingIntent checkoffPi = PendingIntent.getBroadcast(context, appWidgetId * 10 + 6, checkoffTemplate, mutableFlags);
        views.setPendingIntentTemplate(R.id.widget_items_list, checkoffPi);

        mgr.updateAppWidget(appWidgetId, views);
    }
}
