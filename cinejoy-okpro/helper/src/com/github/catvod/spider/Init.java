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

    public static Activity getActivity() throws Exception {
        Class<?> activityThreadClass = Class.forName("android.app.ActivityThread");
        Object activityThread = activityThreadClass
                .getMethod("currentActivityThread")
                .invoke(null);

        Field activitiesField = activityThreadClass.getDeclaredField("mActivities");
        activitiesField.setAccessible(true);

        Map<?, ?> activities = (Map<?, ?>) activitiesField.get(activityThread);
        if (activities == null) return null;

        for (Object activityRecord : activities.values()) {
            if (activityRecord == null) continue;

            Class<?> recordClass = activityRecord.getClass();

            Field pausedField = recordClass.getDeclaredField("paused");
            pausedField.setAccessible(true);

            if (!pausedField.getBoolean(activityRecord)) {
                Field activityField = recordClass.getDeclaredField("activity");
                activityField.setAccessible(true);

                Object value = activityField.get(activityRecord);
                if (value instanceof Activity) {
                    return (Activity) value;
                }
            }
        }

        return null;
    }

    public static Activity getConfigActivity() throws Exception {
        return getActivity();
    }

    public static Activity activity() {
        try {
            return getActivity();
        } catch (Throwable e) {
            return null;
        }
    }
}
