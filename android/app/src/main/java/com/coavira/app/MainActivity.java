package com.coavira.app;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Kant till kant på alla Android-versioner (Android 15+ kräver det ändå).
        // Webbappen lägger själv till avstånd för statusfält och navigeringsfält
        // via env(safe-area-inset-*) / --safe-area-inset-* (Capacitor SystemBars).
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        lockHorizontalScroll();
    }

    /**
     * v42: appen scrollar bara vertikalt. Ingen "överscroll"-glöd/studs i
     * kanterna och ingen horisontell rullningslist – resten (overflow-x,
     * overscroll-behavior-x, touch-action) sköts i webbappens CSS (globals.css).
     */
    private void lockHorizontalScroll() {
        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        if (webView == null) return;
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setHorizontalScrollBarEnabled(false);
    }
}
