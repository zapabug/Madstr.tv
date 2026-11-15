package com.madstr.tvapp;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlaybackPlugin.class); // background play (spec feat-android-play §A2)
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onDestroy() {
        stopService(new Intent(this, PlaybackService.class)); // the page and its music end with the activity
        super.onDestroy();
    }
}
