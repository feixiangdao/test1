package com.github.catvod.spider;

import android.app.Activity;
import android.app.Application;
import android.content.Context;

import java.lang.reflect.Field;
import java.util.Map;

public class Init {

    private static Application app;

    public static void init(Context context) {
        try {
            app = (Application) context;
        } catch (Throwable ignored) {
        }
    }

    public static Application context() {
        return app;
    }

    private static Map<?, ?> activities() throws Exception {
        Class<?> activityThreadClass = Class.forName("android.app.ActivityThread");
        Object activityThread = activityThreadClass
                .getMethod("currentActivityThread")
                .invoke(null);
        Field activitiesField = activityThreadClass.getDeclaredField("mActivities");
        activitiesField.setAccessible(true);
        return (Map<?, ?>) activitiesField.get(activityThread);
    }

    private static Activity recordActivity(Object record) throws Exception {
        if (record == null) return null;
        Field activityField = record.getClass().getDeclaredField("activity");
        activityField.setAccessible(true);
        Object value = activityField.get(record);
        return value instanceof Activity ? (Activity) value : null;
    }

    public static Activity getActivity() throws Exception {
        Map<?, ?> map = activities();
        if (map == null) return null;
        for (Object record : map.values()) {
            if (record == null) continue;
            Field pausedField = record.getClass().getDeclaredField("paused");
            pausedField.setAccessible(true);
            if (pausedField.getBoolean(record)) continue;
            Activity activity = recordActivity(record);
            if (activity != null && !activity.isFinishing()) return activity;
        }
        return null;
    }

    public static Activity getConfigActivity() throws Exception {
        Map<?, ?> map = activities();
        if (map == null) return null;

        Activity fallback = null;
        for (Object record : map.values()) {
            Activity activity = recordActivity(record);
            if (activity == null || activity.isFinishing()) continue;
            String name = activity.getComponentName().getClassName();
            if (name.contains("Home") || name.contains("Main")) return activity;
            if (!name.contains("Video") && !name.contains("Detail")) fallback = activity;
        }
        return fallback;
    }

    public static void interceptActivityStart() throws Exception {
        Map<?, ?> map = activities();
        if (map == null) return;
        for (Object record : map.values()) {
            Activity activity = recordActivity(record);
            if (activity == null || activity.isFinishing()) continue;
            String name = activity.getComponentName().getClassName();
            if (name.contains("Video") || name.contains("Detail")) activity.finish();
        }
    }

    public static Activity activity() {
        try {
            return getActivity();
        } catch (Throwable e) {
            return null;
        }
    }
}
