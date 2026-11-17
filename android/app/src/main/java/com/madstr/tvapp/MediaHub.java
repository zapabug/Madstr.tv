package com.madstr.tvapp;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.view.KeyEvent;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The app's side of the page player (spec feat-android-native §N1): one media session and one media-style
 * notification showing what the page plays, with previous / play-pause / next and seeking. Their buttons, the
 * lock screen, headphone / Bluetooth buttons and remote media keys all come back as actions for the page.
 * The music itself stays in the WebView. Everything here runs on the main thread.
 */
final class MediaHub {
    interface Listener {
        void onAction(String action, Double position);
    }

    static final int NOTE_ID = 1;
    static final String ACTION_PREFIX = "com.madstr.tvapp.media.";
    private static final String CHANNEL = "playback";
    private static final int TEXT_MAX = 80;
    private static final int ART_MAX_BYTES = 2 * 1024 * 1024;
    private static final int ART_MAX_PX = 512;
    private static final int ART_TIMEOUT_MS = 8000;
    private static final long ACTIONS =
        PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE |
        PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO |
        PlaybackState.ACTION_FAST_FORWARD | PlaybackState.ACTION_REWIND | PlaybackState.ACTION_STOP;

    private static MediaHub instance;
    private static final ExecutorService artLoader = Executors.newSingleThreadExecutor();

    private final Context ctx;
    private final Handler main = new Handler(Looper.getMainLooper());
    private MediaSession session;
    private Listener listener;
    private String title = "";
    private String subtitle = "";
    private String status = "idle";
    private double position = 0;
    private double duration = 0;
    private double rate = 1;
    private String artUrl = "";
    private Bitmap art;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    private MediaHub(Context context) {
        ctx = context.getApplicationContext();
    }

    static synchronized MediaHub get(Context context) {
        if (instance == null) instance = new MediaHub(context);
        return instance;
    }

    void setListener(Listener l) {
        main.post(() -> listener = l);
    }

    /** A control was used: tell the page. */
    void dispatch(String action, Double pos) {
        main.post(() -> {
            if (listener != null) listener.onAction(action, pos);
        });
    }

    /** Media keys while the app is open (TV remotes, keyboards). Null for every other key. */
    static String actionForKey(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_MEDIA_PLAY: return "play";
            case KeyEvent.KEYCODE_MEDIA_PAUSE: return "pause";
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_HEADSETHOOK: return "toggle";
            case KeyEvent.KEYCODE_MEDIA_NEXT: return "next";
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS: return "previous";
            // A TV remote's prev / next buttons send these (zapa's Vestel): previous / next item (feat-tv-remote TV3-2).
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: return "next";
            case KeyEvent.KEYCODE_MEDIA_REWIND: return "previous";
            case KeyEvent.KEYCODE_MEDIA_STOP: return "stop";
            default: return null;
        }
    }

    private static String clip(String raw) {
        if (raw == null) return "";
        String s = raw.replaceAll("[\\p{Cntrl}\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069]", " ").replaceAll("\\s+", " ").trim();
        return s.length() > TEXT_MAX ? s.substring(0, TEXT_MAX - 1) + "…" : s;
    }

    private static double finite(double n) {
        return Double.isNaN(n) || Double.isInfinite(n) || n < 0 ? 0 : n;
    }

    private boolean active() {
        return "playing".equals(status) || "loading".equals(status);
    }

    /** New state from the page. */
    void update(String newTitle, String newSubtitle, String image, String newStatus, double pos, double dur, double newRate) {
        main.post(() -> {
            title = clip(newTitle);
            if (title.isEmpty()) title = "Playing";
            subtitle = clip(newSubtitle);
            status = newStatus == null ? "paused" : newStatus;
            position = finite(pos);
            duration = finite(dur);
            rate = finite(newRate) > 0 ? newRate : 1;
            String wanted = image != null && (image.startsWith("https://") || image.startsWith("http://")) ? image : "";
            if (!wanted.equals(artUrl)) {
                artUrl = wanted;
                art = null;
                if (!wanted.isEmpty()) loadArt(wanted);
            }
            apply();
        });
    }

    private void apply() {
        ensureSession();
        MediaMetadata.Builder meta = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, subtitle)
            .putString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, subtitle);
        if (duration > 0) meta.putLong(MediaMetadata.METADATA_KEY_DURATION, (long) (duration * 1000));
        if (art != null) meta.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, art);
        session.setMetadata(meta.build());
        int state = "playing".equals(status) ? PlaybackState.STATE_PLAYING
            : "loading".equals(status) ? PlaybackState.STATE_BUFFERING : PlaybackState.STATE_PAUSED;
        session.setPlaybackState(new PlaybackState.Builder()
            .setActions(ACTIONS)
            .setState(state, (long) (position * 1000), (float) rate, SystemClock.elapsedRealtime())
            .build());
        session.setActive(true);
        if (active()) holdLocks(); else releaseLocks();
        if (PlaybackService.isRunning()) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTE_ID, notification());
        } else if (active()) {
            try {
                Intent intent = new Intent(ctx, PlaybackService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent);
                else ctx.startService(intent);
            } catch (RuntimeException e) {
                // Android 12+ refuses a foreground-service start from the background; the music plays on.
                android.util.Log.w("MediaHub", "could not start the playback service: " + e.getMessage());
            }
        }
    }

    /** Take the controls away: the player is empty, or paused for too long, or the app is closing. */
    void end() {
        main.post(() -> {
            releaseLocks();
            if (session != null) {
                session.setActive(false);
                session.release();
                session = null;
            }
            ctx.stopService(new Intent(ctx, PlaybackService.class));
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NOTE_ID);
            status = "idle";
        });
    }

    private void ensureSession() {
        if (session != null) return;
        session = new MediaSession(ctx, "madstr");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { dispatch("play", null); }
            @Override public void onPause() { dispatch("pause", null); }
            @Override public void onStop() { dispatch("stop", null); }
            @Override public void onSkipToNext() { dispatch("next", null); }
            @Override public void onSkipToPrevious() { dispatch("previous", null); }
            @Override public void onFastForward() { dispatch("forward", null); }
            @Override public void onRewind() { dispatch("rewind", null); }
            @Override public void onSeekTo(long ms) { dispatch("seek", ms / 1000.0); }
        }, main);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) setLegacyFlags(session);
        PendingIntent open = openApp();
        if (open != null) session.setSessionActivity(open);
    }

    @SuppressWarnings("deprecation") // needed before Android 8 to receive media buttons
    private static void setLegacyFlags(MediaSession s) {
        s.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
    }

    private PendingIntent openApp() {
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (open == null) return null;
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private PendingIntent serviceAction(String action, int code) {
        Intent intent = new Intent(ctx, PlaybackService.class).setAction(ACTION_PREFIX + action);
        return PendingIntent.getService(ctx, code, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification.Action button(int icon, String label, String action, int code) {
        return new Notification.Action.Builder(Icon.createWithResource(ctx, icon), label, serviceAction(action, code)).build();
    }

    /** The current media notification (the service shows it when it starts). */
    @SuppressWarnings("deprecation") // the channel-less builder, only before Android 8
    Notification notification() {
        ensureSession();
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel channel = new NotificationChannel(CHANNEL, "Playing", NotificationManager.IMPORTANCE_LOW);
                channel.setShowBadge(false);
                nm.createNotificationChannel(channel);
            }
            b = new Notification.Builder(ctx, CHANNEL);
        } else {
            b = new Notification.Builder(ctx);
        }
        boolean playing = active();
        b.setSmallIcon(R.drawable.ic_stat_playing)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setShowWhen(false)
            .setOngoing(playing)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setDeleteIntent(serviceAction("dismiss", 9))
            .addAction(button(R.drawable.ic_media_prev, "Previous", "previous", 1))
            .addAction(playing ? button(R.drawable.ic_media_pause, "Pause", "pause", 2) : button(R.drawable.ic_media_play, "Play", "play", 3))
            .addAction(button(R.drawable.ic_media_next, "Next", "next", 4))
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        if (art != null) b.setLargeIcon(art);
        PendingIntent open = openApp();
        if (open != null) b.setContentIntent(open);
        return b.build();
    }

    @SuppressWarnings("deprecation") // WIFI_MODE_FULL_HIGH_PERF: the mode media players still use for streams
    private void holdLocks() {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "madstr:playback");
                wakeLock.setReferenceCounted(false);
            }
        }
        if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire();
        if (wifiLock == null) {
            WifiManager wm = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "madstr:playback");
                wifiLock.setReferenceCounted(false);
            }
        }
        if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
    }

    private void releaseLocks() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
    }

    private void loadArt(String url) {
        artLoader.execute(() -> {
            Bitmap bitmap = fetchArt(url);
            if (bitmap == null) return;
            main.post(() -> {
                if (!url.equals(artUrl) || "idle".equals(status)) return;
                art = bitmap;
                apply();
            });
        });
    }

    private static Bitmap fetchArt(String url) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(ART_TIMEOUT_MS);
            c.setReadTimeout(ART_TIMEOUT_MS);
            if (c.getResponseCode() != 200 || c.getContentLengthLong() > ART_MAX_BYTES) return null;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (InputStream in = c.getInputStream()) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) != -1) {
                    out.write(buf, 0, n);
                    if (out.size() > ART_MAX_BYTES) return null;
                }
            }
            byte[] bytes = out.toByteArray();
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;
            int sample = 1;
            while (Math.max(bounds.outWidth, bounds.outHeight) / sample > ART_MAX_PX * 2) sample *= 2;
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            Bitmap decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
            if (decoded == null) return null;
            int longest = Math.max(decoded.getWidth(), decoded.getHeight());
            if (longest <= ART_MAX_PX) return decoded;
            float scale = (float) ART_MAX_PX / longest;
            return Bitmap.createScaledBitmap(decoded, Math.round(decoded.getWidth() * scale), Math.round(decoded.getHeight() * scale), true);
        } catch (Exception e) {
            return null; // no picture: the controls show without one
        } finally {
            if (c != null) c.disconnect();
        }
    }
}
