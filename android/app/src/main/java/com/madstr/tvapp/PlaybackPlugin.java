package com.madstr.tvapp;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** The page's handle on the media controls (spec feat-android-native §N1): state in, actions out. */
@CapacitorPlugin(
    name = "Playback",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class PlaybackPlugin extends Plugin {
    private static final String PREFS = "madstr.playback";
    private static final String ASKED = "askedNotifications";

    @Override
    public void load() {
        MediaHub.get(getContext()).setListener((action, position) -> {
            JSObject data = new JSObject();
            data.put("action", action);
            if (position != null) data.put("position", position);
            notifyListeners("action", data);
        });
    }

    @PluginMethod
    public void update(PluginCall call) {
        String status = call.getString("status", "paused");
        MediaHub.get(getContext()).update(
            call.getString("title", ""), call.getString("subtitle", ""), call.getString("image", ""), status,
            call.getDouble("position", 0.0), call.getDouble("duration", 0.0), call.getDouble("rate", 1.0));
        boolean playing = "playing".equals(status) || "loading".equals(status);
        if (playing && askForNotifications()) requestPermissionForAlias("notifications", call, "afterNotifications");
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
        call.resolve();
    }

    @PluginMethod
    public void end(PluginCall call) {
        MediaHub.get(getContext()).end();
        call.resolve();
    }
}
