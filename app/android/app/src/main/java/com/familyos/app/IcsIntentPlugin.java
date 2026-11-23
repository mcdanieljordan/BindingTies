package com.familyos.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Hands a calendar file that Android opened with FamilyOS (from email, Files, Drive…) to the web app. */
@CapacitorPlugin(name = "IcsIntent")
public class IcsIntentPlugin extends Plugin {
    static String pending;

    @PluginMethod
    public void getPending(PluginCall call) {
        JSObject o = new JSObject();
        o.put("text", pending);
        pending = null;
        call.resolve(o);
    }
}
