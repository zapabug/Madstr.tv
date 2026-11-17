package com.madstr.tvapp;

import android.app.UiModeManager;
import android.content.Context;
import android.content.res.Configuration;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Is this a TV, and leaving the app (spec feat-tv-remote TVR-R4, TV3-4). */
@CapacitorPlugin(name = "Tv")
public class TvPlugin extends Plugin {
    /** A TV is a device whose UI mode is television (the Leanback launcher implies it). */
    static boolean isTv(Context context) {
        UiModeManager modes = (UiModeManager) context.getSystemService(Context.UI_MODE_SERVICE);
        return modes != null && modes.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject result = new JSObject();
        result.put("tv", isTv(getContext()));
        call.resolve(result);
    }

    /** "Leave Juke⚡tr?" answered Leave: close the app. Closing ends the music (MainActivity.onDestroy). */
    @PluginMethod
    public void leave(PluginCall call) {
        call.resolve();
        getActivity().runOnUiThread(() -> getActivity().finish());
    }
}
