package com.kaufsync.app;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.URLEncoder;

public class MainActivity extends BridgeActivity {
    private String pendingSharedText = null;
    private String pendingSharedImageData = null;
    private String pendingSharedImagePath = null;

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
            String type = intent.getType();
            if (type.startsWith("text/")) {
                String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
                if (sharedText != null && !sharedText.trim().isEmpty()) {
                    pendingSharedText = sharedText.trim();
                    dispatchPendingShare();
                }
            } else if (type.startsWith("image/")) {
                handleSharedImageIntent(intent);
            }
        }
    }

    private void handleSharedImageIntent(Intent intent) {
        try {
            Uri imageUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (imageUri == null) return;

            // 1. Save ephemeral copy to cache directory
            File cacheFile = new File(getCacheDir(), "shared_loyalty_card.jpg");
            InputStream is = getContentResolver().openInputStream(imageUri);
            if (is != null) {
                FileOutputStream fos = new FileOutputStream(cacheFile);
                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = is.read(buffer)) != -1) {
                    fos.write(buffer, 0, bytesRead);
                }
                fos.flush();
                fos.close();
                is.close();
            }

            // 2. Decode & generate compact Data URL for WebView
            BitmapFactory.Options boundsOptions = new BitmapFactory.Options();
            boundsOptions.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(cacheFile.getAbsolutePath(), boundsOptions);

            int width = boundsOptions.outWidth;
            int height = boundsOptions.outHeight;
            int inSampleSize = 1;
            int maxDim = 1600;
            if (width > maxDim || height > maxDim) {
                int halfWidth = width / 2;
                int halfHeight = height / 2;
                while ((halfWidth / inSampleSize) >= maxDim && (halfHeight / inSampleSize) >= maxDim) {
                    inSampleSize *= 2;
                }
            }

            BitmapFactory.Options decodeOptions = new BitmapFactory.Options();
            decodeOptions.inSampleSize = inSampleSize;
            Bitmap bitmap = BitmapFactory.decodeFile(cacheFile.getAbsolutePath(), decodeOptions);

            if (bitmap != null) {
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                bitmap.compress(Bitmap.CompressFormat.JPEG, 85, baos);
                byte[] imgBytes = baos.toByteArray();
                String base64 = Base64.encodeToString(imgBytes, Base64.NO_WRAP);
                pendingSharedImageData = "data:image/jpeg;base64," + base64;
                pendingSharedImagePath = cacheFile.getAbsolutePath();
                bitmap.recycle();
                dispatchPendingShare();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void dispatchPendingShare() {
        if (pendingSharedText == null && pendingSharedImageData == null) return;
        if (this.bridge != null && this.bridge.getWebView() != null) {
            if (pendingSharedText != null) {
                final String textToShare = pendingSharedText;
                pendingSharedText = null;
                this.bridge.getWebView().post(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            String encoded = URLEncoder.encode(textToShare, "UTF-8");
                            String js = "window.dispatchEvent(new CustomEvent('appShareTarget', { detail: { text: decodeURIComponent('" + encoded + "') } }));";
                            bridge.getWebView().evaluateJavascript(js, null);
                            bridge.getWebView().loadUrl("https://localhost/share-target?text=" + encoded);
                        } catch (Exception e) {
                            e.printStackTrace();
                        }
                    }
                });
            }

            if (pendingSharedImageData != null) {
                final String imgData = pendingSharedImageData;
                final String imgPath = pendingSharedImagePath != null ? pendingSharedImagePath.replace("\\", "/") : "";
                pendingSharedImageData = null;
                pendingSharedImagePath = null;
                this.bridge.getWebView().post(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            String js = "(function() {" +
                                "var detail = { dataUrl: '" + imgData + "', nativePath: '" + imgPath + "' };" +
                                "window.__pendingShareImage = detail;" +
                                "window.dispatchEvent(new CustomEvent('appShareTargetImage', { detail: detail }));" +
                                "})();";
                            bridge.getWebView().evaluateJavascript(js, null);
                            bridge.getWebView().loadUrl("https://localhost/share-target?type=image");
                        } catch (Exception e) {
                            e.printStackTrace();
                        }
                    }
                });
            }
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().setVerticalScrollBarEnabled(false);
            this.bridge.getWebView().setHorizontalScrollBarEnabled(false);
            this.bridge.getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
            this.bridge.getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            dispatchPendingShare();
        }
    }
}

