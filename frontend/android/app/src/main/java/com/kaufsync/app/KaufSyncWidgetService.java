package com.kaufsync.app;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

public class KaufSyncWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new KaufSyncRemoteViewsFactory(this.getApplicationContext(), intent);
    }

    private static final class KaufSyncRemoteViewsFactory implements RemoteViewsFactory {
        private final Context context;
        private final int appWidgetId;
        private final List<JSONObject> items = new ArrayList<>();
        private String currentListId = null;

        KaufSyncRemoteViewsFactory(Context context, Intent intent) {
            this.context = context;
            this.appWidgetId = intent.getIntExtra(
                AppWidgetManager.EXTRA_APPWIDGET_ID,
                AppWidgetManager.INVALID_APPWIDGET_ID
            );
        }

        @Override
        public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            items.clear();
            JSONObject snapshot = WidgetDataStore.getSnapshot(context);
            if (!snapshot.optBoolean("is_authenticated", false)) {
                currentListId = null;
                return;
            }
            currentListId = WidgetDataStore.resolveEffectiveListId(context, snapshot, appWidgetId);
            if (currentListId == null) return;

            JSONObject itemsByList = snapshot.optJSONObject("items_by_list");
            if (itemsByList == null) return;
            JSONArray listArr = itemsByList.optJSONArray(currentListId);
            if (listArr == null) return;

            for (int i = 0; i < listArr.length(); i++) {
                JSONObject obj = listArr.optJSONObject(i);
                if (obj != null) {
                    items.add(obj);
                }
            }
        }

        @Override
        public void onDestroy() {
            items.clear();
        }

        @Override
        public int getCount() {
            return items.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= items.size()) {
                return null;
            }
            JSONObject item = items.get(position);
            RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_item_row);

            String itemId = item.optString("id", "");
            String name = item.optString("name", "");
            double qty = item.optDouble("quantity", 1.0);
            String colorHex = item.optString("category_color", "#93c5fd");
            String status = item.optString("status", "open");
            boolean isUrgent = item.optBoolean("is_urgent", false);

            row.setTextViewText(R.id.widget_row_name, name);

            try {
                int parsedColor = Color.parseColor(colorHex);
                row.setInt(R.id.widget_row_cat_dot, "setColorFilter", parsedColor);
            } catch (Exception ignored) {}

            row.setViewVisibility(R.id.widget_row_urgent_dot, isUrgent ? View.VISIBLE : View.GONE);
            row.setViewVisibility(R.id.widget_row_unavail, "unavailable".equals(status) ? View.VISIBLE : View.GONE);

            if (qty > 1.0) {
                String qtyText = (qty % 1.0 == 0)
                    ? ((int) qty) + "×"
                    : qty + "×";
                row.setTextViewText(R.id.widget_row_qty, qtyText);
                row.setViewVisibility(R.id.widget_row_qty, View.VISIBLE);
            } else {
                row.setViewVisibility(R.id.widget_row_qty, View.GONE);
            }

            // Fill-in intent for checking off this item directly from the homescreen
            Intent fillIntent = new Intent();
            fillIntent.putExtra(KaufSyncWidgetProvider.EXTRA_LIST_ID, currentListId);
            fillIntent.putExtra(KaufSyncWidgetProvider.EXTRA_ITEM_ID, itemId);
            fillIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
            row.setOnClickFillInIntent(R.id.widget_row_root, fillIntent);

            return row;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return false;
        }
    }
}
