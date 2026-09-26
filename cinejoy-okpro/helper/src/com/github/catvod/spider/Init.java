package com.github.catvod.spider;

import android.app.Activity;
import android.app.Application;
import android.content.Context;
import android.os.Bundle;

import java.lang.ref.WeakReference;
import java.lang.reflect.Method;

public class Init {

    private static volatile WeakReference<Activity> activityRef = new WeakReference<>(null);
    private static volatile boolean registered = false;

    public static void init(Context context) {
        seedFromHostApp();
        try {
            Context appContext = context == null ? null : context.getApplicationContext();
            if (!(appContext instanceof Application) || registered) return;
            registered = true;
            ((Application) appContext).registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
                @Override
                public void onActivityCreated(Activity activity, Bundle state) {
                    remember(activity);
                }

                @Override
                public void onActivityStarted(Activity activity) {
                    remember(activity);
                }

                @Override
                public void onActivityResumed(Activity activity) {
                    remember(activity);
                }

                @Override
                public void onActivityPaused(Activity activity) {
                }

                @Override
                public void onActivityStopped(Activity activity) {
                }

                @Override
                public void onActivitySaveInstanceState(Activity activity, Bundle state) {
                }

                @Override
                public void onActivityDestroyed(Activity activity) {
                    Activity current = activity();
                    if (current == activity) activityRef = new WeakReference<>(null);
                }
            });
        } catch (Throwable ignored) {
        }
    }

    private static void remember(Activity activity) {
        if (activity != null && !activity.isFinishing()) {
            activityRef = new WeakReference<>(activity);
        }
    }

    private static void seedFromHostApp() {
        try {
            ClassLoader loader = Init.class.getClassLoader();
            Class<?> app = loader.loadClass("com.fongmi.android.tv.App");
            Method method = app.getMethod("activity");
            Object value = method.invoke(null);
            if (value instanceof Activity) remember((Activity) value);
        } catch (Throwable ignored) {
        }
    }

    public static Activity activity() {
        Activity activity = activityRef.get();
        if (activity != null && !activity.isFinishing()) return activity;
        seedFromHostApp();
        activity = activityRef.get();
        return activity != null && !activity.isFinishing() ? activity : null;
    }
}
