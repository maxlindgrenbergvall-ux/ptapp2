package com.coavira.app;

import android.os.Bundle;
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
    }
}
