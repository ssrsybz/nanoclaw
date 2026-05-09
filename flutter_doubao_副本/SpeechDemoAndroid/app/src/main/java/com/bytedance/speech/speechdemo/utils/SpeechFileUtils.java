package com.bytedance.speech.speechdemo.utils;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

public class SpeechFileUtils {
    public static OutputStream OpenOutputFile(String path, String filename) {
        try {
            File outFile = new File(path, filename);
            return new FileOutputStream(outFile);
        } catch (IOException e) {
            e.printStackTrace();
            return null;
        }
    }

    public static boolean WriteData(OutputStream out, byte[] data, int len) {
        if (out == null || len == 0) {
            return false;
        }

        try {
            out.write(data, 0, len);
            return true;
        } catch (IOException e) {
            e.printStackTrace();
            return false;
        }
    }

    public static boolean WriteData(OutputStream out, String data) {
        if (out == null) {
            return false;
        }

        try {
            out.write(data.getBytes());
            return true;
        } catch (IOException e) {
            e.printStackTrace();
            return false;
        }
    }

    public static void CloseOutputFile(OutputStream out) {
        if (out != null) {
            try {
                out.close();
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
    }

    static InputStream OpenInputFile(String path, String filename) {
        try {
            File inFile = new File(path, filename);
            return new FileInputStream(inFile);
        } catch (IOException e) {
            e.printStackTrace();
            return null;
        }
    }

    static int ReadData(InputStream in, byte[] data, int len) {
        if (in == null) {
            return 0;
        }

        int ret;
        try {
            ret = in.read(data, 0, len);
        } catch (IOException e) {
            e.printStackTrace();
            ret = -1;
        }
        return ret;
    }

    static void CloseInputFile(InputStream in) {
        if (in != null) {
            try {
                in.close();
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
    }
}
