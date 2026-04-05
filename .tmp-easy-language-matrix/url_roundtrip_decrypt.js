function WT_Run(text) {
  return decodeURIComponent(String(text));
}

WScript.Echo(String(WT_Run("Hello%20%3C%3E%26%22'%20123")));
