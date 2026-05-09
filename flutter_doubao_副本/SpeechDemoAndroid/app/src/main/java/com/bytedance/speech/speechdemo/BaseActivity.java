// Copyright 2021 Bytedance Inc. All Rights Reserved.
// Author: chengzihao.ds@bytedance.com (chengzihao.ds)

package com.bytedance.speech.speechdemo;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.MenuItem;
import android.view.View;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.bytedance.speech.speechdemo.utils.SpeechDemoDefines;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public class BaseActivity extends AppCompatActivity {
    private static final int CODE_PERMISSION_REQUEST = 999;
    private static final int CODE_ACTIVITY_RESULT = 999;

    // Bundle
    private Bundle mBundle;

    // Debug path
    private String mDebugPath;

    @SuppressLint({"ClickableViewAccessibility", "InflateParams", "HardwareIds"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        super.setContentView(R.layout.activity_base);

        if (getIntent() != null) {
            mBundle = getIntent().getExtras();
        }
    }

    @Override
    public void setContentView(int layoutResID) {
        LayoutInflater.from(this).inflate(layoutResID, findViewById(R.id.root_container));
    }

    protected void setTitleBar(int nameRes) {
        Toolbar mMainToolbar = findViewById(R.id.main_toolbar);
        mMainToolbar.setVisibility(View.VISIBLE);
        mMainToolbar.setTitle(nameRes);
        setSupportActionBar(mMainToolbar);
        Objects.requireNonNull(getSupportActionBar()).setDisplayHomeAsUpEnabled(true);
    }

    /* --------------------------- Bundle Pass --------------------------- */
    @Override
    public void onBackPressed() {
        Log.i(SpeechDemoDefines.TAG, "onBackPressed");
        Intent intent = new Intent();
        if (mBundle != null) {
            intent.putExtras(mBundle);
        }
        setResult(CODE_ACTIVITY_RESULT, intent);
        this.finish();
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        Log.i(SpeechDemoDefines.TAG, "onOptionsItemSelected");
        if (item.getItemId() == android.R.id.home) {
            Intent intent = new Intent();
            if (mBundle != null) {
                intent.putExtras(mBundle);
            }
            setResult(CODE_ACTIVITY_RESULT, intent);
            this.finish();
        }
        return super.onOptionsItemSelected(item);
    }

    protected void goToSettingsActivity(String viewId) {
        Intent intent = new Intent(BaseActivity.this, SettingsActivity.class);

        if (mBundle != null) {
            intent.putExtras(mBundle);
        }
        intent.putExtra(SettingsActivity.BUNDLE_KEY_VIEW_ID, viewId);
        startActivityForResult(intent, CODE_ACTIVITY_RESULT);
    }
    /* --------------------------- Bundle Pass End --------------------------- */

    /**
     * check and request multiple permissions
     * @param permissions: permission list
     * @return if all permissions already granted.
     */
    public boolean requestPermission(List<String> permissions) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            ArrayList<String> unAuthedPermission = new ArrayList<>();
            for (String permission : permissions) {
                if (ContextCompat.checkSelfPermission(this, permission)
                        != PackageManager.PERMISSION_GRANTED) {
                    unAuthedPermission.add(permission);
                }
            }
            if (unAuthedPermission.isEmpty()) {
                return true;
            }
            ActivityCompat.requestPermissions(this, unAuthedPermission.toArray(new String[0]), CODE_PERMISSION_REQUEST);
            return false;
        } else {
            return true;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CODE_PERMISSION_REQUEST) {
            if (grantResults.length > 0) {
                for (int i = 0; i < grantResults.length; ++i) {
                    if (grantResults[i] != PackageManager.PERMISSION_GRANTED){
                        Log.i(SpeechDemoDefines.TAG, permissions[i] + " not permitted!");
                        Toast.makeText(BaseActivity.this, permissions[i] + " not permitted!", Toast.LENGTH_SHORT).show();
                        break;
                    }
                }
            }
        }
    }

    /**
     * get default debug path
     * @return string: debugPath
     */
    public String getDebugPath() {
        if (mDebugPath != null) {
            return mDebugPath;
        }
        String state = Environment.getExternalStorageState();
        if (Environment.MEDIA_MOUNTED.equals(state)) {
            Log.d(SpeechDemoDefines.TAG, "External storage can be read and write.");
        } else {
            Log.e(SpeechDemoDefines.TAG, "External storage can't write.");
            return "";
        }
        File debugDir = getExternalFilesDir(null);
        if (debugDir == null) {
            return "";
        }
        if (!debugDir.exists()) {
            if (debugDir.mkdirs()) {
                Log.d(SpeechDemoDefines.TAG, "Create debug path successfully.");
            } else {
                Log.e(SpeechDemoDefines.TAG, "Failed to create debug path.");
                return "";
            }
        }
        mDebugPath = debugDir.getAbsolutePath();
        return mDebugPath;
    }

    /**
     * copy files from assets "assets/<fromPath>" to "/data/user/0/com.bytedance.speech.speechdemo/files/<fromPath>"
     * @param fromPath: copy files directory
     * @return String: "/data/user/0/com.bytedance.speech.speechdemo/files/<fromPath>"
     */
    protected String copyAssetsToFiles(String fromPath) {
        return copyAssetsToFiles(fromPath, getFilesDir().getPath() + "/" + fromPath);
    }

    /**
     * copy files from directory "assets/<fromPath>" to "<toPath>"
     * @param fromPath: copy from assets file path.
     * @param toPath: copy to file path.
     * @return String: "<toPath>"
     */
    protected String copyAssetsToFiles(String fromPath, String toPath) {
        String[] files;
        try {
            files = getAssets().list(fromPath);
            assert files != null;
            if (files.length > 0) { // This is a folder
                File workingFile = new File(toPath);
                if (!workingFile.exists()) {
                    if (!workingFile.mkdirs()) {
                        return "";
                    }
                }
                Log.d(SpeechDemoDefines.TAG, "Working file path: " + workingFile.getPath());

                for (String file : files) {
                    Log.d(SpeechDemoDefines.TAG, file);
                    String subDir = copyAssetsToFiles(fromPath + "/" + file);
                    if (subDir.isEmpty()) { // This is a file
                        File outFile = new File(workingFile, file);
                        if (outFile.exists()) {
                            continue;
                        }
                        Log.d(SpeechDemoDefines.TAG, "File: " + outFile.getPath());

                        InputStream in = getAssets().open(fromPath + "/" + file);
                        OutputStream out = new FileOutputStream(outFile);
                        byte[] buf = new byte[1024];
                        int len;
                        while ((len = in.read(buf)) > 0) {
                            out.write(buf, 0, len);
                        }

                        in.close();
                        out.close();
                    }
                }
                return workingFile.getPath();
            }
        } catch (IOException e) {
            e.printStackTrace();
            return "";
        }
        return "";
    }

    /* --------------------------- Common View Operation --------------------------- */
    /**
     * set button enabled
     * @param view Target view.
     * @param isActive Active or not.
     */
    protected void setButton(View view, boolean isActive) {
        if (isActive) {
            view.setBackground(getResources().getDrawable(R.drawable.btn_active_background));
            view.setEnabled(true);
        } else {
            view.setBackground(getResources().getDrawable(R.drawable.btn_negative_background));
            view.setEnabled(false);
        }
    }

    /**
     * set TextView text on ui thread
     * @param textView Target textView.
     * @param text Text to show.
     */
    protected void setTextOnUiThread(TextView textView, String text) {
        setTextOnUiThread(textView, text, false);
    }

    /**
     * set TextView text on ui thread
     * @param textView Target textView.
     * @param textId Text id.
     */
    protected void setTextOnUiThread(TextView textView, int textId) {
        setTextOnUiThread(textView, textId, false);
    }

    /**
     * set TextView text on ui thread
     * @param textView Target textView.
     * @param text Text to show.
     * @param append Apend or not.
     */
    protected void setTextOnUiThread(final TextView textView, final String text, final boolean append) {
        runOnUiThread(() -> {
            if (append) {
                textView.append("\n" + text);
            } else {
                textView.setText(text);
            }
        });
    }

    /**
     * set TextView text on ui thread
     * @param textView Target textView.
     * @param textId Text id.
     * @param append Apend or not.
     */
    protected void setTextOnUiThread(final TextView textView, final int textId, final boolean append) {
        runOnUiThread(() -> {
            if (append) {
                textView.append("\n" + getResources().getString(textId));
            } else {
                textView.setText(textId);
            }
        });
    }
}
