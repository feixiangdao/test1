package com.github.catvod.js;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.text.InputType;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.FrameLayout;

import com.whl.quickjs.wrapper.JSMethod;
import com.whl.quickjs.wrapper.QuickJSContext;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public class Function {

    private final QuickJSContext ctx;

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

    private Activity currentActivity() {
        try {
            Class<?> app = getClass().getClassLoader().loadClass("com.fongmi.android.tv.App");
            Method activity = app.getMethod("activity");
            Object value = activity.invoke(null);
            if (value instanceof Activity) return (Activity) value;
        } catch (Throwable ignored) {
        }
        try {
            Class<?> app = Class.forName("com.fongmi.android.tv.App", false, ClassLoader.getSystemClassLoader());
            Method activity = app.getMethod("activity");
            Object value = activity.invoke(null);
            if (value instanceof Activity) return (Activity) value;
        } catch (Throwable ignored) {
        }
        return null;
    }

    private int dp(Activity activity, int value) {
        return (int) (value * activity.getResources().getDisplayMetrics().density + 0.5f);
    }

    private Object newBuilder(Activity activity) throws Exception {
        try {
            Class<?> clz = getClass().getClassLoader().loadClass("com.google.android.material.dialog.MaterialAlertDialogBuilder");
            Constructor<?> ctor = clz.getConstructor(android.content.Context.class);
            return ctor.newInstance(activity);
        } catch (Throwable ignored) {
        }
        try {
            Class<?> clz = getClass().getClassLoader().loadClass("androidx.appcompat.app.AlertDialog$Builder");
            Constructor<?> ctor = clz.getConstructor(android.content.Context.class);
            return ctor.newInstance(activity);
        } catch (Throwable ignored) {
        }
        return new AlertDialog.Builder(activity);
    }

    private Object call(Object obj, String name, Class<?>[] types, Object... args) throws Exception {
        Method method = obj.getClass().getMethod(name, types);
        return method.invoke(obj, args);
    }

    @JSMethod
    public String inputDialog(String title, String message, String hint, String initial, Boolean multiline) {
        final Activity activity = currentActivity();
        if (activity == null) return "__ERR_NO_ACTIVITY__";

        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicReference<String> result = new AtomicReference<>("__ERR_UNKNOWN__");

        activity.runOnUiThread(() -> {
            try {
                EditText input = new EditText(activity);
                input.setHint(hint == null ? "" : hint);
                input.setText(initial == null ? "" : initial);
                input.setTextSize(16f);
                input.setSelectAllOnFocus(false);

                boolean multi = Boolean.TRUE.equals(multiline);
                input.setSingleLine(!multi);
                input.setMinLines(multi ? 4 : 1);
                input.setMaxLines(multi ? 8 : 1);
                input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);

                FrameLayout box = new FrameLayout(activity);
                int h = dp(activity, 12);
                int v = dp(activity, 6);
                box.setPadding(h, v, h, 0);
                box.addView(input, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                ));

                Object builder = newBuilder(activity);
                call(builder, "setTitle", new Class[]{CharSequence.class},
                        title == null || title.isEmpty() ? "Cinejoy 设置" : title);
                call(builder, "setMessage", new Class[]{CharSequence.class}, message == null ? "" : message);
                call(builder, "setView", new Class[]{View.class}, box);

                DialogInterface.OnClickListener cancel = (d, which) -> {
                    result.set("__CANCEL__");
                    latch.countDown();
                };
                call(builder, "setNegativeButton",
                        new Class[]{CharSequence.class, DialogInterface.OnClickListener.class},
                        "取消", cancel);
                call(builder, "setPositiveButton",
                        new Class[]{CharSequence.class, DialogInterface.OnClickListener.class},
                        "保存", null);

                Object dialogObj = call(builder, "create", new Class[]{});
                if (!(dialogObj instanceof android.app.Dialog)) {
                    result.set("__ERR_DIALOG_TYPE__:" + dialogObj.getClass().getName());
                    latch.countDown();
                    return;
                }

                android.app.Dialog dialog = (android.app.Dialog) dialogObj;
                dialog.setOnCancelListener(d -> {
                    result.set("__CANCEL__");
                    latch.countDown();
                });
                dialog.setOnDismissListener(d -> latch.countDown());
                dialog.setOnShowListener(d -> {
                    try {
                        Method getButton = dialogObj.getClass().getMethod("getButton", int.class);
                        Object buttonObj = getButton.invoke(dialogObj, DialogInterface.BUTTON_POSITIVE);
                        if (buttonObj instanceof View) {
                            ((View) buttonObj).setOnClickListener(vw -> {
                                String value = input.getText() == null ? "" : input.getText().toString().trim();
                                result.set(value);
                                dialog.dismiss();
                            });
                        } else {
                            result.set("__ERR_BUTTON__");
                            dialog.dismiss();
                        }
                    } catch (Throwable e) {
                        result.set("__ERR_BUTTON__:" + e.getClass().getSimpleName());
                        dialog.dismiss();
                    }
                });

                dialog.show();
                input.requestFocus();
            } catch (Throwable e) {
                result.set("__ERR_SHOW__:" + e.getClass().getSimpleName() + ":" +
                        (e.getMessage() == null ? "" : e.getMessage()));
                latch.countDown();
            }
        });

        try {
            if (!latch.await(5, TimeUnit.MINUTES)) {
                return "__ERR_TIMEOUT__";
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return "__ERR_INTERRUPTED__";
        }
        return result.get();
    }
}
