package com.madstr.tvapp;

import android.os.Bundle;
import android.view.KeyEvent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlaybackPlugin.class); // media controls (spec feat-android-native §N1)
        registerPlugin(LocalFoldersPlugin.class); // remembered folders (§N2)
        super.onCreate(savedInstanceState);
        bridge.setWebViewClient(new LocalFilesWebViewClient(bridge)); // serves /_madstr_local/ (§N2)
    }

    /** Media keys from TV remotes and keyboards while the app is open go to the page's player. */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        String action = MediaHub.actionForKey(event.getKeyCode());
        if (action == null) return super.dispatchKeyEvent(event);
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) MediaHub.get(this).dispatch(action, null);
        return true;
    }

    @Override
    public void onDestroy() {
        if (isFinishing()) MediaHub.get(this).end(); // the page and its music end with the activity
        super.onDestroy();
    }
}
