package com.madstr.tvapp;

import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/** Capacitor's client, plus the remembered-folder file server (spec feat-android-native §N2). */
public class LocalFilesWebViewClient extends BridgeWebViewClient {
    public LocalFilesWebViewClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        if (LocalFileServer.handles(request)) return LocalFileServer.serve(view.getContext().getApplicationContext(), request);
        return super.shouldInterceptRequest(view, request);
    }
}
