package com.madstr.tvapp;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * Remembered folders in the app (spec feat-android-native §N2): Android's folder picker with a persisted read
 * grant, a scan with the web's rules, and giving the grant back on remove. The files themselves reach the page
 * through LocalFileServer.
 */
@CapacitorPlugin(name = "LocalFolders")
public class LocalFoldersPlugin extends Plugin {
    static final int MAX_FILES = 2000; // the web's MAX_LOCAL_FILES
    static final int MAX_DEPTH = 6; // the web's MAX_DEPTH
    private static final Pattern AUDIO_EXT = Pattern.compile("\\.(mp3|m4a|ogg|opus|aac|wav|flac)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern IMAGE_EXT = Pattern.compile("\\.(jpe?g|png|webp|gif|avif)$", Pattern.CASE_INSENSITIVE);
    private final ExecutorService scanner = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        try {
            startActivityForResult(call, intent, "picked");
        } catch (ActivityNotFoundException e) {
            call.reject("This device has no folder picker", "NO_PICKER");
        }
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.resolve(new JSObject()); // closed without picking
            return;
        }
        Uri tree = data.getData();
        ContentResolver cr = getContext().getContentResolver();
        try {
            cr.takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException e) {
            call.reject("Android did not let the app keep this folder", "NO_ACCESS");
            return;
        }
        JSObject out = new JSObject();
        out.put("uri", tree.toString());
        out.put("name", folderName(cr, tree));
        call.resolve(out);
    }

    private static String folderName(ContentResolver cr, Uri tree) {
        Uri root = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        try (Cursor c = cr.query(root, new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst() && c.getString(0) != null) return c.getString(0);
        } catch (RuntimeException ignored) {
            // fall through to the id
        }
        String id = DocumentsContract.getTreeDocumentId(tree);
        int colon = id.lastIndexOf(':');
        return colon >= 0 && colon < id.length() - 1 ? id.substring(colon + 1) : id;
    }

    /** True when the app still holds read access to this folder (or a folder containing this document). */
    static boolean hasAccess(Context context, Uri uri) {
        String target = uri.toString();
        for (UriPermission p : context.getContentResolver().getPersistedUriPermissions()) {
            if (!p.isReadPermission()) continue;
            String tree = p.getUri().toString();
            if (target.equals(tree) || target.startsWith(tree + "/document/")) return true;
        }
        return false;
    }

    @PluginMethod
    public void list(PluginCall call) {
        String raw = call.getString("uri", "");
        String kind = "image".equals(call.getString("kind")) ? "image" : "audio";
        Uri tree = Uri.parse(raw);
        if (!"content".equals(tree.getScheme()) || !hasAccess(getContext(), tree)) {
            call.reject("No access", "NO_ACCESS");
            return;
        }
        scanner.execute(() -> {
            try {
                JSArray files = new JSArray();
                walk(getContext().getContentResolver(), tree, DocumentsContract.getTreeDocumentId(tree), "", 0, kind, files);
                JSObject out = new JSObject();
                out.put("files", files);
                call.resolve(out);
            } catch (SecurityException e) {
                call.reject("No access", "NO_ACCESS");
            } catch (RuntimeException e) {
                call.reject("Could not read this folder", "READ_FAILED");
            }
        });
    }

    private static void walk(ContentResolver cr, Uri tree, String parentId, String prefix, int depth, String kind, JSArray out) {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId);
        String[] cols = {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_LAST_MODIFIED,
        };
        try (Cursor c = cr.query(children, cols, null, null, null)) {
            if (c == null) return;
            while (c.moveToNext() && out.length() < MAX_FILES) {
                String id = c.getString(0);
                String name = c.getString(1) == null ? "" : c.getString(1);
                String mime = c.getString(2) == null ? "" : c.getString(2).toLowerCase(Locale.ROOT);
                if (id == null) continue;
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                    if (depth < MAX_DEPTH) walk(cr, tree, id, prefix + name + "/", depth + 1, kind, out);
                    continue;
                }
                boolean wanted = "image".equals(kind)
                    ? IMAGE_EXT.matcher(name).find() || mime.startsWith("image/")
                    : AUDIO_EXT.matcher(name).find() || mime.startsWith("audio/");
                if (!wanted) continue;
                JSObject f = new JSObject();
                f.put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, id).toString());
                f.put("path", prefix + name);
                f.put("name", name);
                f.put("mime", mime);
                f.put("modified", c.isNull(3) ? 0 : c.getLong(3));
                out.put(f);
            }
        }
    }

    @PluginMethod
    public void release(PluginCall call) {
        Uri tree = Uri.parse(call.getString("uri", ""));
        try {
            getContext().getContentResolver().releasePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException ignored) {
            // already gone
        }
        call.resolve();
    }
}
