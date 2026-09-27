package com.github.catvod.js;

import android.app.Activity;
import android.app.Dialog;
import android.content.DialogInterface;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.Toast;

import com.github.catvod.spider.Init;
import com.whl.quickjs.wrapper.JSMethod;
import com.whl.quickjs.wrapper.QuickJSContext;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class Function {

    private static final String PREF_TMDB = "cache_cinejoy_tmdbKey";
    private static final String PREF_SUBDL = "cache_cinejoy_subdlKey";
    private static final int MAX_DOWNLOAD = 12 * 1024 * 1024;
    private static final int MAX_SUBTITLE = 3 * 1024 * 1024;

    private final QuickJSContext ctx;
    private final Handler main = new Handler(Looper.getMainLooper());

    public Function(QuickJSContext ctx) {
        this.ctx = ctx;
        setProperty();
    }

    private void setProperty() {
        for (Method method : getClass().getMethods()) {
            if (!method.isAnnotationPresent(JSMethod.class)) continue;
            ctx.getGlobalObject().setProperty(method.getName(), args -> {
                try {
                    return method.invoke(this, args);
                } catch (Throwable e) {
                    return "__ERR_INVOKE__:" + e.getClass().getSimpleName();
                }
            });
        }
    }

    private ClassLoader hostLoader() {
        ClassLoader loader = getClass().getClassLoader();
        return loader == null ? Thread.currentThread().getContextClassLoader() : loader;
    }

    private int dp(Activity activity, int value) {
        return (int) (value * activity.getResources().getDisplayMetrics().density + 0.5f);
    }

    private String prefGet(String key) {
        try {
            Class<?> prefers = hostLoader().loadClass("com.github.catvod.utils.Prefers");
            Object value = prefers.getMethod("getString", String.class).invoke(null, key);
            return value == null ? "" : String.valueOf(value);
        } catch (Throwable e) {
            return "";
        }
    }

    private boolean prefPut(String key, String value) {
        try {
            Class<?> prefers = hostLoader().loadClass("com.github.catvod.utils.Prefers");
            prefers.getMethod("put", String.class, Object.class).invoke(null, key, value);
            return true;
        } catch (Throwable e) {
            return false;
        }
    }

    private boolean prefRemove(String key) {
        try {
            Class<?> prefers = hostLoader().loadClass("com.github.catvod.utils.Prefers");
            prefers.getMethod("remove", String.class).invoke(null, key);
            return true;
        } catch (Throwable e) {
            return false;
        }
    }

    private Object newBuilder(Activity activity) throws Exception {
        try {
            Class<?> clz = hostLoader().loadClass("com.google.android.material.dialog.MaterialAlertDialogBuilder");
            Constructor<?> ctor = clz.getConstructor(android.content.Context.class);
            return ctor.newInstance(activity);
        } catch (Throwable ignored) {
        }
        try {
            Class<?> clz = hostLoader().loadClass("androidx.appcompat.app.AlertDialog$Builder");
            Constructor<?> ctor = clz.getConstructor(android.content.Context.class);
            return ctor.newInstance(activity);
        } catch (Throwable ignored) {
        }
        return new android.app.AlertDialog.Builder(activity);
    }

    private Object call(Object obj, String name, Class<?>[] types, Object... args) throws Exception {
        Method method = obj.getClass().getMethod(name, types);
        return method.invoke(obj, args);
    }

    private void toast(String text) {
        try {
            if (Init.context() != null) Toast.makeText(Init.context(), text, Toast.LENGTH_LONG).show();
        } catch (Throwable ignored) {
        }
    }

    private boolean validTmdb(String value) {
        return value != null && value.trim().matches("(?i)^[a-f0-9]{32}$");
    }

    private boolean validSubdl(String value) {
        return value != null && value.trim().length() >= 6;
    }

    private void showSecretDialog(Activity activity, String title, String message, String hint,
                                  String prefKey, boolean tmdb) {
        try {
            EditText input = new EditText(activity);
            input.setHint(hint);
            input.setText(prefGet(prefKey));
            input.setTextSize(16f);
            input.setSingleLine(true);
            input.setSelectAllOnFocus(false);
            input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);

            FrameLayout box = new FrameLayout(activity);
            int h = dp(activity, 14);
            int v = dp(activity, 8);
            box.setPadding(h, v, h, 0);
            box.addView(input, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
            ));

            Object builder = newBuilder(activity);
            call(builder, "setTitle", new Class[]{CharSequence.class}, title);
            call(builder, "setMessage", new Class[]{CharSequence.class}, message);
            call(builder, "setView", new Class[]{View.class}, box);
            call(builder, "setNegativeButton",
                    new Class[]{CharSequence.class, DialogInterface.OnClickListener.class},
                    "取消", (DialogInterface.OnClickListener) (d, which) -> {});
            call(builder, "setNeutralButton",
                    new Class[]{CharSequence.class, DialogInterface.OnClickListener.class},
                    "清除", (DialogInterface.OnClickListener) (d, which) -> {
                        prefRemove(prefKey);
                        Toast.makeText(activity, title + " 已清除", Toast.LENGTH_SHORT).show();
                    });
            call(builder, "setPositiveButton",
                    new Class[]{CharSequence.class, DialogInterface.OnClickListener.class},
                    "保存", null);

            Object obj = call(builder, "create", new Class[]{});
            if (!(obj instanceof Dialog)) {
                toast("__ERR_DIALOG_TYPE__");
                return;
            }

            Dialog dialog = (Dialog) obj;
            dialog.setOnShowListener(d -> {
                try {
                    Method getButton = obj.getClass().getMethod("getButton", int.class);
                    Object button = getButton.invoke(obj, DialogInterface.BUTTON_POSITIVE);
                    if (!(button instanceof View)) {
                        toast("__ERR_BUTTON__");
                        return;
                    }
                    ((View) button).setOnClickListener(view -> {
                        String value = input.getText() == null ? "" : input.getText().toString().trim();
                        boolean valid = tmdb ? validTmdb(value) : validSubdl(value);
                        if (!valid) {
                            input.setError(tmdb ? "请输入有效的32位 TMDB API v3 Key" : "请输入有效的 SubDL API Key");
                            input.requestFocus();
                            return;
                        }
                        if (prefPut(prefKey, value)) {
                            Toast.makeText(activity, title + " 已保存到本机", Toast.LENGTH_SHORT).show();
                            dialog.dismiss();
                        } else {
                            input.setError("保存失败");
                        }
                    });
                } catch (Throwable e) {
                    toast("__ERR_BUTTON__:" + e.getClass().getSimpleName());
                }
            });

            dialog.show();
            input.requestFocus();
        } catch (Throwable e) {
            toast("__ERR_SHOW__:" + e.getClass().getSimpleName() + ":" +
                    (e.getMessage() == null ? "" : e.getMessage()));
        }
    }

    private String scheduleSecretDialog(String title, String message, String hint,
                                        String prefKey, boolean tmdb) {
        main.post(() -> {
            try {
                Init.interceptActivityStart();
            } catch (Throwable e) {
                toast("__ERR_INTERCEPT__:" + e.getClass().getSimpleName());
            }

            main.postDelayed(() -> {
                try {
                    Activity activity = Init.getConfigActivity();
                    if (activity == null || activity.isFinishing()) {
                        toast("__ERR_CONFIG_ACTIVITY__");
                        return;
                    }
                    showSecretDialog(activity, title, message, hint, prefKey, tmdb);
                } catch (Throwable e) {
                    toast("__ERR_CONFIG_ACTIVITY__:" + e.getClass().getSimpleName() + ":" +
                            (e.getMessage() == null ? "" : e.getMessage()));
                }
            }, 250);
        });
        return "__SCHEDULED__";
    }

    @JSMethod
    public String showTmdbDialogFromDetail() {
        return scheduleSecretDialog(
                "TMDB Key 设置",
                "请输入 TMDB API v3 Key。保存后只存储在本机，不会上传到 GitHub。",
                "32位 TMDB API v3 Key",
                PREF_TMDB,
                true
        );
    }

    @JSMethod
    public String showTmdbDialog() {
        return showTmdbDialogFromDetail();
    }

    @JSMethod
    public String showSubdlDialogFromDetail() {
        return scheduleSecretDialog(
                "SubDL API Key 设置",
                "请输入 SubDL API Key。Key 只保存在本机，用于搜索中文字幕。",
                "SubDL API Key",
                PREF_SUBDL,
                false
        );
    }

    private byte[] readAll(InputStream in, int maxBytes) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int total = 0;
        int n;
        while ((n = in.read(buf)) > 0) {
            total += n;
            if (total > maxBytes) throw new Exception("payload too large");
            out.write(buf, 0, n);
        }
        return out.toByteArray();
    }

    private byte[] download(String address) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(address).openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(20000);
        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Android) Cinejoy/1.0");
        conn.setRequestProperty("Accept", "*/*");
        int code = conn.getResponseCode();
        if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
        try (InputStream in = conn.getInputStream()) {
            return readAll(in, MAX_DOWNLOAD);
        } finally {
            conn.disconnect();
        }
    }

    private boolean looksZip(byte[] data) {
        return data != null && data.length >= 4
                && data[0] == 0x50 && data[1] == 0x4b
                && (data[2] == 0x03 || data[2] == 0x05 || data[2] == 0x07);
    }

    private String ext(String name) {
        if (name == null) return "";
        String clean = name.toLowerCase(Locale.US);
        int q = clean.indexOf('?');
        if (q >= 0) clean = clean.substring(0, q);
        int dot = clean.lastIndexOf('.');
        return dot >= 0 ? clean.substring(dot + 1) : "";
    }

    private int subtitleScore(String name, int season, int episode) {
        String e = ext(name);
        int score;
        if ("srt".equals(e)) score = 50;
        else if ("ass".equals(e)) score = 40;
        else if ("ssa".equals(e)) score = 35;
        else if ("vtt".equals(e)) score = 30;
        else if ("sub".equals(e)) score = 10;
        else return -1;

        if (episode > 0) {
            String n = name == null ? "" : name;
            String se = "(?i).*s0*" + season + "[ ._\\-]*e0*" + episode + "(?:\\D|$).*";
            String ee = "(?i).*e0*" + episode + "(?:\\D|$).*";
            if (season > 0 && n.matches(se)) score += 200;
            else if (n.matches(ee)) score += 150;
        }
        return score;
    }

    private String decodeStrict(byte[] data, Charset charset) {
        try {
            return charset.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(data)).toString();
        } catch (CharacterCodingException e) {
            return null;
        }
    }

    private String decode(byte[] data, String lang) throws Exception {
        if (data == null) return "";
        if (data.length >= 3 && (data[0] & 0xff) == 0xef && (data[1] & 0xff) == 0xbb && (data[2] & 0xff) == 0xbf) {
            return new String(data, 3, data.length - 3, StandardCharsets.UTF_8);
        }
        if (data.length >= 2 && (data[0] & 0xff) == 0xff && (data[1] & 0xff) == 0xfe) {
            return new String(data, 2, data.length - 2, Charset.forName("UTF-16LE"));
        }
        if (data.length >= 2 && (data[0] & 0xff) == 0xfe && (data[1] & 0xff) == 0xff) {
            return new String(data, 2, data.length - 2, Charset.forName("UTF-16BE"));
        }

        String utf8 = decodeStrict(data, StandardCharsets.UTF_8);
        if (utf8 != null) return utf8;

        boolean traditional = lang != null && lang.toUpperCase(Locale.US).contains("ZH_BG");
        Charset first = Charset.forName(traditional ? "Big5" : "GB18030");
        Charset second = Charset.forName(traditional ? "GB18030" : "Big5");
        String text = decodeStrict(data, first);
        if (text != null) return text;
        text = decodeStrict(data, second);
        if (text != null) return text;
        return new String(data, first);
    }

    private String assTime(String value) {
        try {
            String[] p = value.trim().split(":");
            double sec = Double.parseDouble(p[2]);
            int h = Integer.parseInt(p[0]);
            int m = Integer.parseInt(p[1]);
            int s = (int) sec;
            int ms = (int) Math.round((sec - s) * 1000.0);
            if (ms >= 1000) { s += 1; ms -= 1000; }
            return String.format(Locale.US, "%02d:%02d:%02d,%03d", h, m, s, ms);
        } catch (Throwable e) {
            return "00:00:00,000";
        }
    }

    private String assToSrt(String text) {
        String[] lines = text.replace("\r", "").split("\n");
        int startIndex = 1;
        int endIndex = 2;
        int textIndex = 9;
        int fields = 10;
        boolean events = false;
        int count = 1;
        StringBuilder out = new StringBuilder();

        for (String line : lines) {
            String trim = line.trim();
            if (trim.equalsIgnoreCase("[Events]")) {
                events = true;
                continue;
            }
            if (events && trim.startsWith("[") && !trim.equalsIgnoreCase("[Events]")) {
                events = false;
            }
            if (!events) continue;

            if (trim.toLowerCase(Locale.US).startsWith("format:")) {
                String[] names = trim.substring(7).split(",");
                fields = names.length;
                for (int i = 0; i < names.length; i++) {
                    String n = names[i].trim().toLowerCase(Locale.US);
                    if ("start".equals(n)) startIndex = i;
                    else if ("end".equals(n)) endIndex = i;
                    else if ("text".equals(n)) textIndex = i;
                }
                continue;
            }

            if (!trim.toLowerCase(Locale.US).startsWith("dialogue:")) continue;
            String payload = trim.substring(9).trim();
            String[] parts = payload.split(",", fields);
            if (parts.length <= Math.max(textIndex, Math.max(startIndex, endIndex))) continue;
            String body = parts[textIndex]
                    .replaceAll("\\{[^}]*\\}", "")
                    .replace("\\N", "\n")
                    .replace("\\n", "\n")
                    .replace("\\h", " ")
                    .trim();
            if (body.isEmpty()) continue;

            out.append(count++).append("\n")
                    .append(assTime(parts[startIndex])).append(" --> ").append(assTime(parts[endIndex])).append("\n")
                    .append(body).append("\n\n");
        }
        return out.length() > 0 ? out.toString() : text;
    }

    private String vttToSrt(String text) {
        String normalized = text.replace("\r", "").replace("\uFEFF", "");
        String[] blocks = normalized.split("\n\\s*\n");
        int count = 1;
        StringBuilder out = new StringBuilder();
        Pattern time = Pattern.compile("(\\d{2}:)?\\d{2}:\\d{2}\\.\\d{3}\\s+-->\\s+(\\d{2}:)?\\d{2}:\\d{2}\\.\\d{3}");

        for (String block : blocks) {
            String[] lines = block.split("\n");
            int timeLine = -1;
            for (int i = 0; i < lines.length; i++) {
                if (time.matcher(lines[i].trim()).find()) {
                    timeLine = i;
                    break;
                }
            }
            if (timeLine < 0) continue;

            String timing = lines[timeLine].trim()
                    .replaceAll("(\\d{2}:\\d{2}:\\d{2})\\.(\\d{3})", "$1,$2")
                    .replaceAll("(\\d{2}:\\d{2})\\.(\\d{3})", "00:$1,$2");
            int settings = timing.indexOf(" ", timing.indexOf("-->") + 4);
            if (settings > 0) timing = timing.substring(0, settings).trim();

            StringBuilder body = new StringBuilder();
            for (int i = timeLine + 1; i < lines.length; i++) {
                if (body.length() > 0) body.append("\n");
                body.append(lines[i]);
            }
            if (body.length() == 0) continue;

            out.append(count++).append("\n")
                    .append(timing).append("\n")
                    .append(body).append("\n\n");
        }
        return out.length() > 0 ? out.toString() : normalized.replace("WEBVTT", "");
    }

    private String detectFormat(String name, String text) {
        String e = ext(name);
        if ("srt".equals(e) || "ass".equals(e) || "ssa".equals(e) || "vtt".equals(e) || "sub".equals(e)) return e;
        String t = text == null ? "" : text.trim();
        if (t.startsWith("WEBVTT")) return "vtt";
        if (t.contains("[Script Info]") || t.contains("[Events]")) return "ass";
        return "srt";
    }

    private String normalizeToSrt(String text, String format) {
        if ("ass".equals(format) || "ssa".equals(format)) return assToSrt(text);
        if ("vtt".equals(format)) return vttToSrt(text);
        return text;
    }

    @JSMethod
    public String fetchSubdlPayload(String address, String seasonText, String episodeText, String lang) {
        JSONObject result = new JSONObject();
        try {
            int season = 0;
            int episode = 0;
            try { season = Integer.parseInt(seasonText == null ? "0" : seasonText); } catch (Throwable ignored) {}
            try { episode = Integer.parseInt(episodeText == null ? "0" : episodeText); } catch (Throwable ignored) {}

            byte[] payload = download(address);
            byte[] subtitleBytes = payload;
            String chosenName = address;

            if (looksZip(payload)) {
                byte[] best = null;
                String bestName = "";
                int bestScore = -1;
                try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(payload))) {
                    ZipEntry entry;
                    while ((entry = zip.getNextEntry()) != null) {
                        if (entry.isDirectory()) continue;
                        String name = entry.getName();
                        if (name == null || name.contains("__MACOSX/") || name.substring(name.lastIndexOf('/') + 1).startsWith("._")) continue;
                        int score = subtitleScore(name, season, episode);
                        if (score < 0) continue;
                        byte[] bytes = readAll(zip, MAX_SUBTITLE);
                        if (score > bestScore) {
                            bestScore = score;
                            best = bytes;
                            bestName = name;
                        }
                    }
                }
                if (best == null) throw new Exception("ZIP 中没有可用字幕");
                subtitleBytes = best;
                chosenName = bestName;
            }

            String decoded = decode(subtitleBytes, lang);
            String format = detectFormat(chosenName, decoded);
            String text = normalizeToSrt(decoded, format);

            result.put("ok", true);
            result.put("format", "srt");
            result.put("source_format", format);
            result.put("text", text);
            result.put("name", chosenName);
        } catch (Throwable e) {
            try {
                result.put("ok", false);
                result.put("error", e.getClass().getSimpleName() + ":" + (e.getMessage() == null ? "" : e.getMessage()));
            } catch (Throwable ignored) {
            }
        }
        return result.toString();
    }
}
