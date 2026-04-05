/**
 * Expert Script: Anti-Debug & Root Bypass
 * Purpose: Bypass standard Android security checks.
 */

Java.perform(function() {
    const String = Java.use('java.lang.String');
    const File = Java.use('java.io.File');

    // Bypass common Root Check files
    const rootFiles = [
        "/system/app/Superuser.apk",
        "/sbin/su",
        "/system/bin/su",
        "/system/xbin/su",
        "/data/local/xbin/su",
        "/data/local/bin/su",
        "/system/sd/xbin/su",
        "/system/bin/failsafe/su",
        "/data/local/su"
    ];

    File.exists.implementation = function() {
        const path = this.getAbsolutePath();
        if (rootFiles.indexOf(path) > -1) {
            console.log(`[+] Bypassing root check for: ${path}`);
            return false;
        }
        return this.exists();
    };

    // Prevent Debug.isDebuggerConnected() from returning true
    const Debug = Java.use('android.os.Debug');
    Debug.isDebuggerConnected.implementation = function() {
        console.log("[+] Bypassing isDebuggerConnected()");
        return false;
    };

    console.log("[*] Basic Anti-Debug & Root Bypass active.");
});
