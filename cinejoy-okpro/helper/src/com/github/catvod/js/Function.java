package com.github.catvod.js;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.text.InputType;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.FrameLayout;

import com.whl.quickjs.wrapper.JSMethod;
import com.whl.quickjs.wrapper.QuickJSContext;

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
                    return null;
                }
            });
        }
    }

    private Activity currentActivity() {
        try {
            Class<?> app = Class.forName("com.fongmi.android.tv.App");
            Method activity = app.getMethod("activity");
            Object value = activity.invoke(null);
            return value instanceof Activity ? (Activity) value : null;
        } catch (Throwable e) {
            return null;
        }
    }

    private int dp(Activity activity, int value) {
        return (int) (value * activity.getResources().getDisplayMetrics().density + 0.5f);
    }

    @JSMethod
    public String inputDialog(String title, String message, String hint, String initial, Boolean multiline) {
        final Activity activity = currentActivity();
        if (activity == null) return "";

        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicReference<String> result = new AtomicReference<>("");
        final AtomicReference<AlertDialog> dialogRef = new AtomicReference<>();

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
                int h = dp(activity, 8);
                int v = dp(activity, 4);
                box.setPadding(h, v, h, 0);
                box.addView(input, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                ));

                AlertDialog dialog = new AlertDialog.Builder(activity)
                        .setTitle(title == null || title.isEmpty() ? "Cinejoy 设置" : title)
                        .setMessage(message == null ? "" : message)
                        .setView(box)
                        .setNegativeButton("取消", (d, which) -> {
                            result.set("");
                            latch.countDown();
                        })
                        .setPositiveButton("保存", null)
                        .create();

                dialogRef.set(dialog);
                dialog.setOnCancelListener(d -> {
                    result.set("");
                    latch.countDown();
                });
                dialog.setOnDismissListener(d -> latch.countDown());
                dialog.setOnShowListener(d -> dialog.getButton(DialogInterface.BUTTON_POSITIVE).setOnClickListener(vw -> {
                    String value = input.getText() == null ? "" : input.getText().toString().trim();
                    result.set(value);
                    dialog.dismiss();
                }));

                dialog.show();
                input.requestFocus();
            } catch (Throwable e) {
                latch.countDown();
            }
        });

        try {
            if (!latch.await(5, TimeUnit.MINUTES)) {
                activity.runOnUiThread(() -> {
                    AlertDialog dialog = dialogRef.get();
                    if (dialog != null && dialog.isShowing()) dialog.dismiss();
                });
                return "";
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return "";
        }
        return result.get();
    }
}
