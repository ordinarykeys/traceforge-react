function WT_Run(text) {
  return encodeURIComponent(String(text));
}

WScript.Echo(String(WT_Run("Hello <>&\"' 123")));
