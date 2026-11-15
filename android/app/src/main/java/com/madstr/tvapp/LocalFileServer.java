package com.madstr.tvapp;

import android.content.ContentResolver;
import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Serves files from remembered folders to the page at /_madstr_local/<base64url(document uri)> (spec
 * feat-android-native §N2), read-only, with byte ranges so audio can seek. Only documents inside a folder the
 * app holds access to are served. (Capacitor's own content server ignores the start of a range.)
 */
final class LocalFileServer {
    static final String PREFIX = "/_madstr_local/";
    private static final Pattern RANGE = Pattern.compile("^bytes=(\\d*)-(\\d*)$");

    private LocalFileServer() {}

    static boolean handles(WebResourceRequest request) {
        Uri url = request.getUrl();
        String path = url.getPath();
        return "localhost".equals(url.getHost()) && path != null && path.startsWith(PREFIX);
    }

    static WebResourceResponse serve(Context context, WebResourceRequest request) {
        Uri doc;
        try {
            String enc = request.getUrl().getPath().substring(PREFIX.length());
            doc = Uri.parse(new String(Base64.decode(enc, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING), StandardCharsets.UTF_8));
        } catch (IllegalArgumentException e) {
            return status(400, "Bad Request");
        }
        if (!"content".equals(doc.getScheme()) || !LocalFoldersPlugin.hasAccess(context, doc)) return status(403, "Forbidden");
        ContentResolver cr = context.getContentResolver();
        AssetFileDescriptor afd;
        try {
            afd = cr.openAssetFileDescriptor(doc, "r");
        } catch (IOException | SecurityException e) {
            return status(404, "Not Found");
        }
        if (afd == null) return status(404, "Not Found");
        long total = afd.getLength();
        if (total < 0) total = sizeOf(cr, doc);
        String mime = cr.getType(doc);
        if (mime == null) mime = "application/octet-stream";
        Map<String, String> headers = new HashMap<>();
        headers.put("Accept-Ranges", "bytes");
        headers.put("Cache-Control", "no-store");
        try {
            InputStream in = afd.createInputStream();
            String range = header(request, "Range");
            Matcher m = range == null ? null : RANGE.matcher(range.trim());
            if (m != null && m.matches() && total > 0 && !(m.group(1).isEmpty() && m.group(2).isEmpty())) {
                long start;
                long end;
                if (m.group(1).isEmpty()) { // suffix: the last n bytes
                    start = Math.max(0, total - Long.parseLong(m.group(2)));
                    end = total - 1;
                } else {
                    start = Long.parseLong(m.group(1));
                    end = m.group(2).isEmpty() ? total - 1 : Math.min(Long.parseLong(m.group(2)), total - 1);
                }
                if (start >= total || start > end) {
                    in.close();
                    headers.put("Content-Range", "bytes */" + total);
                    return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", headers, empty());
                }
                skipFully(in, start);
                long length = end - start + 1;
                headers.put("Content-Range", "bytes " + start + "-" + end + "/" + total);
                headers.put("Content-Length", Long.toString(length));
                return new WebResourceResponse(mime, null, 206, "Partial Content", headers, new Bounded(in, length));
            }
            if (total >= 0) headers.put("Content-Length", Long.toString(total));
            return new WebResourceResponse(mime, null, 200, "OK", headers, in);
        } catch (IOException | NumberFormatException e) {
            return status(500, "Internal Server Error");
        }
    }

    private static String header(WebResourceRequest request, String name) {
        for (Map.Entry<String, String> e : request.getRequestHeaders().entrySet()) {
            if (e.getKey() != null && e.getKey().equalsIgnoreCase(name)) return e.getValue();
        }
        return null;
    }

    private static long sizeOf(ContentResolver cr, Uri doc) {
        try (Cursor c = cr.query(doc, new String[] { OpenableColumns.SIZE }, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getLong(0);
        } catch (RuntimeException ignored) {
            // unknown size
        }
        return -1;
    }

    private static void skipFully(InputStream in, long n) throws IOException {
        long left = n;
        while (left > 0) {
            long skipped = in.skip(left);
            if (skipped <= 0) {
                if (in.read() == -1) throw new IOException("range past the end");
                skipped = 1;
            }
            left -= skipped;
        }
    }

    private static InputStream empty() {
        return new ByteArrayInputStream(new byte[0]);
    }

    private static WebResourceResponse status(int code, String reason) {
        return new WebResourceResponse("text/plain", "utf-8", code, reason, new HashMap<>(), empty());
    }

    /** Reads at most `left` bytes of the wrapped stream. */
    private static final class Bounded extends FilterInputStream {
        private long left;

        Bounded(InputStream in, long length) {
            super(in);
            left = length;
        }

        @Override
        public int read() throws IOException {
            if (left <= 0) return -1;
            int b = super.read();
            if (b >= 0) left--;
            return b;
        }

        @Override
        public int read(byte[] buf, int off, int len) throws IOException {
            if (left <= 0) return -1;
            int n = super.read(buf, off, (int) Math.min(len, left));
            if (n > 0) left -= n;
            return n;
        }

        @Override
        public int available() throws IOException {
            return (int) Math.min(super.available(), left);
        }
    }
}
