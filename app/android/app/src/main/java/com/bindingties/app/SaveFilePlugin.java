package com.bindingties.app;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;

/** Saves a PDF the app just made and opens the phone's share sheet (Save to Drive/Files, email, messages...). */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {
    @PluginMethod
    public void sharePdf(PluginCall call) {
        String data = call.getString("data");
        String name = call.getString("name", "journal.pdf").replaceAll("[^A-Za-z0-9._-]", "_");
        if (data == null) { call.reject("No file data"); return; }
        try {
            File dir = new File(getContext().getCacheDir(), "shared");
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
            File file = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(file)) { out.write(Base64.decode(data, Base64.DEFAULT)); }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("application/pdf");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, name);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, call.getString("title", "Save or send your journal"));
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not save the file: " + e.getMessage());
        }
    }
}
