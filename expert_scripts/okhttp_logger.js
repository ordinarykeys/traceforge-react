/**
 * Expert Script: OkHttp Traffic Logger
 * Purpose: Intercept and dump all OkHttp requests and responses in plain text.
 */

function hookOkHttp() {
    try {
        const Interceptor = Java.use('okhttp3.Interceptor');
        const MyInterceptor = Java.registerClass({
            name: 'com.traceforge.interceptor.LoggingInterceptor',
            implements: [Interceptor],
            methods: {
                intercept: function(chain) {
                    const request = chain.request();
                    console.log(`\n\n[REQUEST] ${request.method()} ${request.url().toString()}`);
                    const headers = request.headers();
                    for (let i = 0; i < headers.size(); i++) {
                        console.log(`  ${headers.name(i)}: ${headers.value(i)}`);
                    }

                    const response = chain.proceed(request);
                    console.log(`\n[RESPONSE] Code: ${response.code()}`);
                    return response;
                }
            }
        });
        
        // This is a simplified version. For a real app, we find the OkHttpClient.Builder
        const OkHttpClientBuilder = Java.use('okhttp3.OkHttpClient$Builder');
        OkHttpClientBuilder.build.implementation = function() {
            this.addInterceptor(MyInterceptor.$new());
            console.log("[+] Injected LoggingInterceptor into OkHttpClient");
            return this.build();
        };

    } catch (e) {
        console.warn("[-] OkHttp3 not found or failed to hook: " + e);
        // Fallback or legacy OkHttp hooking logic here
    }
}

Java.perform(function() {
    hookOkHttp();
});
