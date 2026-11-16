package com.madstr.tvapp;

import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlaybackPlugin.class); // media controls (spec feat-android-native §N1)
        registerPlugin(LocalFoldersPlugin.class); // remembered folders (§N2)
        super.onCreate(savedInstanceState);
        bridge.setWebViewClient(new LocalFilesWebViewClient(bridge)); // serves /_madstr_local/ (§N2)
        hideSystemBars();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                goBack();
            }
        });
    }

    /** Back (the swipe or the button) is the page's back, not an exit (zapa, feat-phone-inline §P12). On the board
     *  it sends the app to the background, so the music keeps playing; anywhere else it goes back a page, or to the
     *  board when there is nothing to go back to. */
    private void goBack() {
        WebView web = bridge.getWebView();
        web.evaluateJavascript("(function(){var h=location.hash;return h===''||h==='#'||h==='#/';})()", onBoard -> {
            if ("true".equals(onBoard)) moveTaskToBack(true);
            else if (web.canGoBack()) web.goBack();
            else web.evaluateJavascript("location.hash='#/'", null);
        });
    }

    /** The status bar and the gesture handle are hidden (zapa, feat-phone-inline §P6): a swipe from the top or bottom
     *  edge shows them for a moment, a second swipe up goes home. They hide again whenever the app comes back to the front. */
    private void hideSystemBars() {
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        bars.hide(WindowInsetsCompat.Type.systemBars());
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
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
