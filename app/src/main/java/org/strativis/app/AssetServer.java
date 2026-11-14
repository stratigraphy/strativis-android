package org.strativis.app;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Minimal HTTP server on 127.0.0.1 serving the web app (HTML, JavaScript and
 * the webR WebAssembly files) from the APK assets. Loading the app from
 * http://127.0.0.1 gives the WebView a secure origin, so Web Workers,
 * WebAssembly and SharedArrayBuffer work exactly as in a desktop browser.
 */
public final class AssetServer {

    /** Source of the files (the APK assets on Android, a folder in tests). */
    public interface Source {
        InputStream open(String path) throws IOException;
    }

    private final Source source;
    private final String prefix;
    private ServerSocket server;
    private final ExecutorService pool = Executors.newFixedThreadPool(6);

    public AssetServer(Source source, String prefix) {
        this.source = source;
        this.prefix = prefix;
    }

    /**
     * Starts the server on the preferred port (a fixed port keeps the same
     * web origin between launches, so the app's saved data is kept), or on
     * any free port if it is taken.
     */
    public int start(int preferredPort) throws IOException {
        try {
            server = new ServerSocket(preferredPort, 50, InetAddress.getByName("127.0.0.1"));
        } catch (IOException e) {
            server = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
        }
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                while (!server.isClosed()) {
                    try {
                        final Socket s = server.accept();
                        pool.execute(new Runnable() {
                            @Override
                            public void run() {
                                handle(s);
                            }
                        });
                    } catch (IOException e) {
                        if (server.isClosed()) {
                            break;
                        }
                    }
                }
            }
        }, "asset-server");
        t.setDaemon(true);
        t.start();
        return server.getLocalPort();
    }

    public void stop() {
        try {
            server.close();
        } catch (IOException ignored) {
            // already closed
        }
        pool.shutdownNow();
    }

    static String mime(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html; charset=utf-8";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript; charset=utf-8";
        if (p.endsWith(".css")) return "text/css; charset=utf-8";
        if (p.endsWith(".json")) return "application/json; charset=utf-8";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".r") || p.endsWith(".txt")) return "text/plain; charset=utf-8";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream(1 << 16);
        byte[] buf = new byte[1 << 16];
        int n;
        while ((n = in.read(buf)) > 0) {
            bos.write(buf, 0, n);
        }
        in.close();
        return bos.toByteArray();
    }

    private void handle(Socket s) {
        try (Socket sock = s) {
            sock.setSoTimeout(30000);
            BufferedReader rd = new BufferedReader(new InputStreamReader(sock.getInputStream(), StandardCharsets.ISO_8859_1));
            String line = rd.readLine();
            if (line == null) {
                return;
            }
            String h;
            while ((h = rd.readLine()) != null && !h.isEmpty()) {
                // headers are not needed
            }
            String[] parts = line.split(" ");
            OutputStream out = sock.getOutputStream();
            if (parts.length < 2 || !(parts[0].equals("GET") || parts[0].equals("HEAD"))) {
                send(out, 405, "Method Not Allowed", "text/plain", "method not allowed".getBytes(StandardCharsets.UTF_8), false);
                return;
            }
            String path = parts[1];
            int q = path.indexOf('?');
            if (q >= 0) {
                path = path.substring(0, q);
            }
            int f = path.indexOf('#');
            if (f >= 0) {
                path = path.substring(0, f);
            }
            path = URLDecoder.decode(path, "UTF-8");
            while (path.startsWith("/")) {
                path = path.substring(1);
            }
            if (path.isEmpty() || path.endsWith("/")) {
                path = path + "index.html";
            }
            if (path.contains("..")) {
                send(out, 403, "Forbidden", "text/plain", "forbidden".getBytes(StandardCharsets.UTF_8), false);
                return;
            }
            byte[] body;
            try {
                body = readAll(source.open(prefix + path));
            } catch (IOException e) {
                send(out, 404, "Not Found", "text/plain", ("not found: " + path).getBytes(StandardCharsets.UTF_8), false);
                return;
            }
            send(out, 200, "OK", mime(path), body, parts[0].equals("HEAD"));
        } catch (IOException ignored) {
            // client went away
        }
    }

    private static void send(OutputStream out, int code, String msg, String type, byte[] body, boolean head) throws IOException {
        String hdr = "HTTP/1.1 " + code + " " + msg + "\r\n"
            + "Content-Type: " + type + "\r\n"
            + "Content-Length: " + body.length + "\r\n"
            + "Cache-Control: no-cache\r\n"
            + "Cross-Origin-Opener-Policy: same-origin\r\n"
            + "Cross-Origin-Embedder-Policy: require-corp\r\n"
            + "Cross-Origin-Resource-Policy: same-origin\r\n"
            + "Connection: close\r\n\r\n";
        out.write(hdr.getBytes(StandardCharsets.ISO_8859_1));
        if (!head) {
            out.write(body);
        }
        out.flush();
    }
}
