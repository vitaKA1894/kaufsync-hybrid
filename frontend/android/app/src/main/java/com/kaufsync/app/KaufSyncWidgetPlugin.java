package com.kaufsync.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;

@CapacitorPlugin(name = "KaufSyncBridge")
public class KaufSyncWidgetPlugin extends Plugin {
    private static volatile String pendingShortcutJson = null;

    public static void setPendingShortcutJson(String json) {
        pendingShortcutJson = json;
    }

    @PluginMethod
    public void updateWidgetSnapshot(PluginCall call) {
        String snapshotJson = call.getString("snapshotJson", "{}");
        WidgetDataStore.saveSnapshotJson(getContext(), snapshotJson);
        KaufSyncWidgetProvider.refreshAllWidgets(getContext());
        call.resolve();
    }

    @PluginMethod
    public void clearWidgetData(PluginCall call) {
        WidgetDataStore.clearAll(getContext());
        KaufSyncWidgetProvider.refreshAllWidgets(getContext());
        call.resolve();
    }

    @PluginMethod
    public void drainPendingCheckoffs(PluginCall call) {
        String opsJson = WidgetDataStore.getPendingCheckoffsJson(getContext());
        JSObject ret = new JSObject();
        ret.put("opsJson", opsJson);
        call.resolve(ret);
    }

    @PluginMethod
    public void ackPendingCheckoffs(PluginCall call) {
        String opIdsJson = call.getString("opIdsJson", "[]");
        try {
            JSONArray arr = new JSONArray(opIdsJson);
            WidgetDataStore.ackPendingCheckoffs(getContext(), arr);
        } catch (Exception ignored) {}
        KaufSyncWidgetProvider.refreshAllWidgets(getContext());
        call.resolve();
    }

    @PluginMethod
    public void consumePendingShortcut(PluginCall call) {
        String json = pendingShortcutJson;
        pendingShortcutJson = null;
        JSObject ret = new JSObject();
        ret.put("shortcutJson", json);
        call.resolve(ret);
    }
}
