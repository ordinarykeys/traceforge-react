/**
 * Expert Script: Native Library Debugger
 * Purpose: Trace System.loadLibrary to identify which .so fails or triggers a crash.
 */

Java.perform(function() {
    const System = Java.use('java.lang.System');
    const Runtime = Java.use('java.lang.Runtime');
    const VMStack = Java.use('dalvik.system.VMStack');

    // Hook loadLibrary
    System.loadLibrary.overload('java.lang.String').implementation = function(libname) {
        console.log(`[*] System.loadLibrary("${libname}") called from ${VMStack.getCallingClassLoader()}`);
        try {
            this.loadLibrary(libname);
            console.log(`[+] Successfully loaded: ${libname}`);
        } catch (err) {
            console.error(`[-] FAILED to load: ${libname}. Error: ${err}`);
            // Trace the stack to see who called it
            console.log(Java.use("android.util.Log").getStackTraceString(Java.use("java.lang.Exception").$new()));
        }
    };

    // Hook Runtime.loadLibrary0
    Runtime.loadLibrary0.overload('java.lang.ClassLoader', 'java.lang.String').implementation = function(loader, libname) {
        console.log(`[*] Runtime.loadLibrary0("${libname}")`);
        try {
            this.loadLibrary0(loader, libname);
        } catch (err) {
            console.error(`[-] Runtime failed loading ${libname}: ${err}`);
        }
    };

    // Hook System.exit to prevent early termination
    System.exit.implementation = function(code) {
        console.warn(`[!] App tried to exit with code ${code}. BLOCKING it to keep session alive.`);
        // console.log(Java.use("android.util.Log").getStackTraceString(Java.use("java.lang.Exception").$new()));
    };
});
