package com.kaufsync.app;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;
import java.net.URLEncoder;

public class MainActivity extends BridgeActivity {
    private String pendingSharedText = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleSendIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleSendIntent(intent);
    }

    private void handleSendIntent(Intent intent) {
        if (intent != null && Intent.ACTION_SEND.equals(intent.getAction()) && intent.getType() != null) {
            if (intent.getType().startsWith("text/")) {
                String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
                if (sharedText != null && !sharedText.trim().isEmpty()) {
                    pendingSharedText = sharedText.trim();
                    dispatchPendingShare();
                }
            }
        }
    }

    private void dispatchPendingShare() {
        if (pendingSharedText == null) return;
        if (this.bridge != null && this.bridge.getWebView() != null) {
            final String textToShare = pendingSharedText;
            pendingSharedText = null;
            this.bridge.getWebView().post(new Runnable() {
                @Override
                public void run() {
                    try {
                        String encoded = URLEncoder.encode(textToShare, "UTF-8");
                        // 1. Dispatch custom JS event for immediate handling if app is already running
                        String js = "window.dispatchEvent(new CustomEvent('appShareTarget', { detail: { text: decodeURIComponent('" + encoded + "') } }));";
                        bridge.getWebView().evaluateJavascript(js, null);

                        // 2. Also navigate to /share-target route
                        bridge.getWebView().loadUrl("https://localhost/share-target?text=" + encoded);
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
            });
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            dispatchPendingShare();
        }
    }
}

