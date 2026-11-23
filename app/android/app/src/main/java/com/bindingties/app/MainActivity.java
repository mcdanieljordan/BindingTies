package com.bindingties.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IcsIntentPlugin.class);
        super.onCreate(savedInstanceState);
        readCalendar(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (readCalendar(intent) && getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('fos-ics'))", null));
        }
    }

    private boolean readCalendar(Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(action)) uri = intent.getData();
        else if (Intent.ACTION_SEND.equals(action)) uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri == null) return false;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) return false;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n, total = 0;
            while ((n = in.read(buf)) > 0 && total < 3_000_000) { out.write(buf, 0, n); total += n; }
            String text = out.toString("UTF-8");
            if (!text.contains("BEGIN:VCALENDAR")) return false;
            IcsIntentPlugin.pending = text;
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
