package com.madstr.tvapp;

import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/**
 * Keeps the app in the foreground while it has something to play (spec feat-android-play §A2, lifetime in
 * feat-android-native §N1), so Android does not freeze it, and takes the notification's button presses.
 * MediaHub owns the session, the notification and the locks.
 */
public class PlaybackService extends Service {
    private static volatile boolean running = false;

    static boolean isRunning() {
        return running;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        MediaHub hub = MediaHub.get(this);
        String action = intent != null ? intent.getAction() : null;
        if (action != null && action.startsWith(MediaHub.ACTION_PREFIX)) {
            String what = action.substring(MediaHub.ACTION_PREFIX.length());
            if ("dismiss".equals(what)) hub.end();
            else hub.dispatch(what, null);
            if (running) return START_NOT_STICKY;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(MediaHub.NOTE_ID, hub.notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(MediaHub.NOTE_ID, hub.notification());
        }
        running = true;
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        MediaHub.get(this).end(); // swiped away: the page and its music are gone
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        running = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
