package com.madstr.tvapp;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.Logger;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** The page's handle on PlaybackService (spec feat-android-play §A2): start / update while playing, stop after. */
@CapacitorPlugin(
    name = "Playback",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class PlaybackPlugin extends Plugin {
    private static final String PREFS = "madstr.playback";
    private static final String ASKED = "askedNotifications";
    private String lastTitle = "";

    @PluginMethod
    public void start(PluginCall call) {
        String title = call.getString("title", "");
        lastTitle = title;
        Context context = getContext();
        try {
            if (PlaybackService.isRunning()) {
                PlaybackService.updateTitle(context, title);
            } else {
                Intent intent = new Intent(context, PlaybackService.class).putExtra(PlaybackService.EXTRA_TITLE, title);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
                else context.startService(intent);
            }
        } catch (RuntimeException e) {
            // Android 12+ refuses to start a foreground service from the background; the music plays on regardless.
            Logger.warn("Playback", "could not start the playback service: " + e.getMessage());
        }
        if (askForNotifications()) requestPermissionForAlias("notifications", call, "afterNotifications");
        else call.resolve();
    }

    /** Android 13+: ask once, on the first play. A no only hides the notification. */
    private boolean askForNotifications() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return false;
        if (getPermissionState("notifications") != PermissionState.PROMPT) return false;
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (prefs.getBoolean(ASKED, false)) return false;
        prefs.edit().putBoolean(ASKED, true).apply();
        return true;
    }

    @PermissionCallback
    private void afterNotifications(PluginCall call) {
        PlaybackService.updateTitle(getContext(), lastTitle); // show it now that it may be shown
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        context.stopService(new Intent(context, PlaybackService.class));
        call.resolve();
    }
}
