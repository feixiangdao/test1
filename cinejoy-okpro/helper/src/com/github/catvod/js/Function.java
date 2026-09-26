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

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;

public class Function {

    private static final String PREF_KEY = "cache_cinejoy_tmdbKey";
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

    private String prefGet() {
        try {
            Class<?> prefers = hostLoader().loadClass("com.github.catvod.utils.Prefers");
            Object value = prefers.getMethod("getString", String.class).invoke(null, PREF_KEY);
            return value == null ? "" : String.valueOf(value);
        } catch (Throwable e) {
            return "";
        }
    }

    private boolean prefPut(String value) {
        try {
            Class<?> prefers = hostLoader().loadClass("com.github.catvod.utils.Prefers");
            prefers.getMethod("put", String.class, Object.class).invoke(null, PREF_KEY, value);
            return true;
        } catch (Throwable e) {
            return false;
        }
    }

    private boolean prefRemove() {
        try {
            Class<?> prefers = hostLoader().loadClass("com.github.catvod.utils.Prefers");
            prefers.getMethod("remove", String.class).invoke(null, PREF_KEY);
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

    private boolean isKey(String value) {
        return value != null && value.trim().matches("(?i)^[a-f0-9]{32}$");
    }

    private void toast(String text) {
        try {
            if (Init.context() != null) {
                Toast.makeText(Init.context(), text, Toast.LENGTH_LONG).show();
            }
        } catch (Throwable ignored) {
        }
    }

    private void showDialog(Activity activity) {
        try {
            EditText input = new EditText(activity);
            input.setHint("32位 TMDB API v3 Key");
            input.setText(prefGet());
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
            call(builder, "setTitle", new Class[]{CharSequence.class}, "TMDB Key 设置");
            call(builder, "setMessage", new Class[]{CharSequence.class},
                    "请输入 TMDB API v3 Key。保存后只存储在本机，不会上传到 GitHub。");
            call(builder, "setView", new Class[]{View.class}, box);
            call(builder, "setNegativeButton",
                    new Class[]{CharSequence.class, DialogInterface.OnClickListener.class},
                    "取消", (DialogInterface.OnClickListener) (d, which) -> {});
            call(builder, "setNeutralButton",
                    new Class[]{CharSequence.class, DialogInterface.OnClickListener.class},
                    "清除", (DialogInterface.OnClickListener) (d, which) -> {
                        prefRemove();
                        Toast.makeText(activity, "本机 TMDB Key 已清除", Toast.LENGTH_SHORT).show();
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
                        if (!isKey(value)) {
                            input.setError("请输入有效的32位 TMDB API v3 Key");
                            input.requestFocus();
                            return;
                        }
                        if (prefPut(value)) {
                            Toast.makeText(activity, "TMDB Key 已保存到本机", Toast.LENGTH_SHORT).show();
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

    @JSMethod
    public String showTmdbDialogFromDetail() {
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
                    showDialog(activity);
                } catch (Throwable e) {
                    toast("__ERR_CONFIG_ACTIVITY__:" + e.getClass().getSimpleName() + ":" +
                            (e.getMessage() == null ? "" : e.getMessage()));
                }
            }, 250);
        });

        return "__SCHEDULED__";
    }
}
