package org.strativis.app;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.provider.MediaStore;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import android.view.Window;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.IOException;
import java.io.OutputStream;

/**
 * Strativis for Android: a WebView showing the Strativis web app, served
 * from the APK assets by a local server. Everything runs on the phone;
 * no internet connection is needed.
 */
@SuppressWarnings("deprecation") // older APIs kept on purpose for Android 7 to 12
public class MainActivity extends Activity {

    private static final int REQ_SAVE = 11;
    private static final int REQ_OPEN = 12;
    private static final int REQ_GPS = 13;
    private static final int PORT = 47833;
    private static final int BRAND = Color.parseColor("#1f3a4d");

    private WebView web;
    private AssetServer server;
    private byte[] pendingBytes;
    private String pendingName;
    private ValueCallback<Uri[]> fileCallback;
    private boolean cameraOffered;
    private String gpsOrigin;
    private GeolocationPermissions.Callback gpsCallback;
    private SensorManager sensors;
    private SensorEventListener orientationListener;
    private long lastSensorMs;

    /**
     * Compass-clinometer: the rotation vector sensor gives the device axes in
     * east-north-up coordinates (columns of the rotation matrix), passed to
     * window.__strativisAxes(x, y, z, absolute) about 30 times a second.
     */
    private boolean startOrientation() {
        if (sensors == null) {
            sensors = (SensorManager) getSystemService(SENSOR_SERVICE);
        }
        if (sensors == null) {
            return false;
        }
        stopOrientation();
        Sensor s = sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        final boolean absolute = s != null;
        if (s == null) {
            s = sensors.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR);
        }
        if (s == null) {
            return false;
        }
        orientationListener = new SensorEventListener() {
            @Override
            public void onSensorChanged(SensorEvent e) {
                long now = System.currentTimeMillis();
                if (now - lastSensorMs < 33 || web == null) {
                    return;
                }
                lastSensorMs = now;
                float[] r = new float[9];
                SensorManager.getRotationMatrixFromVector(r, e.values);
                final String js = "window.__strativisAxes&&window.__strativisAxes([" + r[0] + "," + r[3] + "," + r[6]
                    + "],[" + r[1] + "," + r[4] + "," + r[7] + "],[" + r[2] + "," + r[5] + "," + r[8] + "]," + absolute + ")";
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (web != null) {
                            web.evaluateJavascript(js, null);
                        }
                    }
                });
            }

            @Override
            public void onAccuracyChanged(Sensor sensor, int accuracy) {
                // the compass accuracy is shown by the drift of the readings
            }
        };
        sensors.registerListener(orientationListener, s, SensorManager.SENSOR_DELAY_GAME);
        return true;
    }

    private void stopOrientation() {
        if (sensors != null && orientationListener != null) {
            sensors.unregisterListener(orientationListener);
        }
        orientationListener = null;
    }

    /** Functions called from JavaScript (window.AndroidBridge). */
    public class Bridge {
        @JavascriptInterface
        public boolean startOrientation() {
            return MainActivity.this.startOrientation();
        }

        @JavascriptInterface
        public void stopOrientation() {
            MainActivity.this.stopOrientation();
        }

        @JavascriptInterface
        public boolean donationsEnabled() {
            return BuildConfig.DONATIONS;
        }

        @JavascriptInterface
        public void saveFile(String name, String mime, String base64) {
            pendingBytes = Base64.decode(base64, Base64.DEFAULT);
            pendingName = name;
            final String fName = name;
            final String fMime = mime;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType(fMime);
                    i.putExtra(Intent.EXTRA_TITLE, fName);
                    startActivityForResult(i, REQ_SAVE);
                }
            });
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        if (Build.VERSION.SDK_INT < 35) {
            w.setStatusBarColor(BRAND);
        }
        server = new AssetServer(new AssetServer.Source() {
            @Override
            public java.io.InputStream open(String path) throws IOException {
                return getAssets().open(path);
            }
        }, "www/");
        int port;
        try {
            port = server.start(PORT);
        } catch (IOException e) {
            Toast.makeText(this, "Strativis could not start: " + e.getMessage(), Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        web = new WebView(this);
        setContentView(edgeToEdge(web));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("http://127.0.0.1:")) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                    // no app for this link
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;
                boolean image = false;
                for (String t : params.getAcceptTypes()) {
                    if (t != null && t.startsWith("image")) {
                        image = true;
                    }
                }
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(image ? "image/*" : "*/*");
                if (!image && params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                Intent chooser = Intent.createChooser(i, image ? "Outcrop photo" : "Open project");
                cameraOffered = false;
                if (image) {
                    // camera first: the photo is written to PhotoProvider
                    Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    Uri out = PhotoProvider.photoUri();
                    cam.putExtra(MediaStore.EXTRA_OUTPUT, out);
                    cam.setClipData(ClipData.newRawUri("photo", out));
                    cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] {cam});
                    cameraOffered = true;
                }
                try {
                    startActivityForResult(chooser, REQ_OPEN);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    gpsOrigin = origin;
                    gpsCallback = callback;
                    requestPermissions(new String[] {Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_GPS);
                }
            }
        });
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.loadUrl("http://127.0.0.1:" + port + "/index.html");
        if (Build.VERSION.SDK_INT >= 33) {
            // Android 16 no longer calls onBackPressed for apps targeting API 36
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT, new OnBackInvokedCallback() {
                    @Override
                    public void onBackInvoked() {
                        handleBack();
                    }
                });
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        if (code == REQ_GPS && gpsCallback != null) {
            boolean ok = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            gpsCallback.invoke(gpsOrigin, ok, false);
            gpsCallback = null;
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == REQ_OPEN) {
            if (fileCallback != null) {
                Uri[] uris = null;
                if (result == RESULT_OK && data != null && data.getClipData() != null
                        && data.getClipData().getItemCount() > 0 && data.getData() == null
                        && !"photo".equals(String.valueOf(data.getClipData().getDescription().getLabel()))) {
                    ClipData cd = data.getClipData();
                    uris = new Uri[cd.getItemCount()];
                    for (int k = 0; k < cd.getItemCount(); k++) {
                        uris[k] = cd.getItemAt(k).getUri();
                    }
                } else if (result == RESULT_OK && data != null && data.getData() != null) {
                    uris = new Uri[] {data.getData()};
                } else if (result == RESULT_OK && cameraOffered) {
                    uris = new Uri[] {PhotoProvider.photoUri()};
                }
                fileCallback.onReceiveValue(uris);
                fileCallback = null;
            }
        } else if (code == REQ_SAVE) {
            String msg;
            if (result == RESULT_OK && data != null && data.getData() != null && pendingBytes != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                    out.write(pendingBytes);
                    msg = "Saved " + pendingName;
                } catch (IOException e) {
                    msg = "Could not save: " + e.getMessage();
                }
            } else {
                msg = "Not saved";
            }
            pendingBytes = null;
            final String js = "window.onAndroidSaved && window.onAndroidSaved(" + quote(msg) + ")";
            web.evaluateJavascript(js, null);
        }
    }

    /**
     * Android 15 and newer draw apps edge to edge: keep the web page clear of
     * the status bar, the navigation bar, display cut-outs and the keyboard.
     */
    private View edgeToEdge(View content) {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BRAND);
        root.addView(content, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
                @Override
                public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                    Insets bars = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout());
                    Insets ime = insets.getInsets(WindowInsets.Type.ime());
                    v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                    return WindowInsets.CONSUMED;
                }
            });
        }
        return root;
    }

    private static String quote(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    @Override
    public void onBackPressed() {
        handleBack();
    }

    /** Back: close the open sheet or menu in the page, otherwise leave the app. */
    private void handleBack() {
        if (web == null) {
            finish();
            return;
        }
        web.evaluateJavascript("window.StrativisBack ? window.StrativisBack() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (!"true".equals(value)) {
                    finish();
                }
            }
        });
    }

    @Override
    protected void onPause() {
        stopOrientation();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (server != null) {
            server.stop();
        }
        if (web != null) {
            web.destroy();
        }
        super.onDestroy();
    }
}
